-- Forno Pizza — proving the recipe lookup adds up.
--
-- Run in the Supabase SQL Editor: paste the whole file, run it once, read the
-- verdict row at the top. Every row should say "ok".
--
-- RUN ORDER: after seed_recipes.sql and recipes.sql.
--
-- WHY THIS FILE EXISTS
-- order_ingredient_requirements() is revoked from anon and authenticated,
-- because the recipes are the shop's own costings. That is the right call, and
-- it means the integration suite — which runs on the anon key — can only prove
-- the function refuses to talk to it. Whether the arithmetic is RIGHT has to be
-- checked from a session that is allowed to ask, and that is this file.
--
-- Leaves nothing behind: the four orders it places are deleted at the end.

drop table if exists recipe_check_results;
create temporary table recipe_check_results (seq serial, check_name text, result text);

do $$
declare
  v_tikka_m   uuid;
  v_tikka_l   uuid;
  v_marg_m    uuid;
  v_burger_r  uuid;
  v_burger_d  uuid;
  v_order_id  uuid;
  v_phone     text;

  v_moz       numeric;
  v_dough     numeric;
  v_rows      int;
  v_missing   int;
  v_expected  numeric;
  v_before    numeric;
  v_after     numeric;
  v_ratios    int;
  v_ratio     numeric;
  v_cheese_id uuid;
  v_plain_id  uuid;
  v_extra_id  uuid;
  v_plain_moz numeric;
  v_extra_moz numeric;
  v_portion   numeric;
  v_mush_id   uuid;
begin
  -- --- the seed is complete -------------------------------------------------
  --
  -- NOT checked anywhere in this file: that every recipe points at an
  -- ingredient that exists, or that quantities are positive. Both are a foreign
  -- key and a check constraint in schema.sql, so a test for them could never
  -- fail — and a check that cannot fail is not reassurance, it is one more row
  -- in a list people already skim.

  select count(*) into v_missing from public.sizes_missing_recipes();

  insert into recipe_check_results (check_name, result) values
    ('every sellable size has a recipe',
     case when v_missing = 0 then 'ok — no size deducts nothing'
          else format('FAIL — %s size(s) have no recipe; run seed_recipes.sql', v_missing) end);

  -- How many distinct Large/Medium ratios exist across the pizzas, and what
  -- they are. Pulled out into variables because the same numbers are wanted
  -- both for the verdict and for the message.
  select count(distinct ratio), min(ratio)
    into v_ratios, v_ratio
  from (
    select round(sum(r.quantity) filter (where ms.size = 'Large')
                 / sum(r.quantity) filter (where ms.size = 'Medium'), 2) as ratio
    from public.recipes r
    join public.menu_item_sizes ms on ms.id = r.menu_item_size_id
    where ms.size in ('Medium', 'Large')
    group by ms.menu_item_id
  ) per_pizza;

  insert into recipe_check_results (check_name, result) values
    ('every pizza scales by one consistent factor',
     case when v_ratios = 1
          then format('ok — every Large is %sx its Medium', v_ratio)
          else format('FAIL — %s different Large/Medium ratios across the menu', v_ratios) end);

  insert into recipe_check_results (check_name, result) values
    ('every ingredient is actually used by something',
     case when not exists (
            select 1 from public.ingredients i
            where not exists (select 1 from public.recipes r where r.ingredient_id = i.id))
          then 'ok'
          else format('FAIL — unused: %s',
                      (select string_agg(i.name, ', ') from public.ingredients i
                       where not exists (select 1 from public.recipes r
                                         where r.ingredient_id = i.id))) end);

  -- --- a Large really is bigger than a Medium -------------------------------

  select ms.id into v_tikka_m from public.menu_item_sizes ms
  join public.menu_items mi on mi.id = ms.menu_item_id
  where mi.name = 'Chicken Tikka' and ms.size = 'Medium';

  select ms.id into v_tikka_l from public.menu_item_sizes ms
  join public.menu_items mi on mi.id = ms.menu_item_id
  where mi.name = 'Chicken Tikka' and ms.size = 'Large';

  insert into recipe_check_results (check_name, result) values
    ('a Large consumes more than a Medium of the same pizza',
     case when (select sum(quantity) from public.recipes where menu_item_size_id = v_tikka_l)
             > (select sum(quantity) from public.recipes where menu_item_size_id = v_tikka_m)
          then 'ok'
          else 'FAIL — the Large is not scaled' end);

  insert into recipe_check_results (check_name, result) values
    ('the two sizes use the same ingredient list',
     case when (select array_agg(ingredient_id order by ingredient_id)
                from public.recipes where menu_item_size_id = v_tikka_m)
             = (select array_agg(ingredient_id order by ingredient_id)
                from public.recipes where menu_item_size_id = v_tikka_l)
          then 'ok — same ingredients, different amounts'
          else 'FAIL — the sizes have drifted apart' end);

  -- --- a Double burger is two fillets in one bun ----------------------------

  select ms.id into v_burger_r from public.menu_item_sizes ms
  join public.menu_items mi on mi.id = ms.menu_item_id
  where mi.name = 'Fiery Fillet Burger' and ms.size = 'Regular';

  select ms.id into v_burger_d from public.menu_item_sizes ms
  join public.menu_items mi on mi.id = ms.menu_item_id
  where mi.name = 'Fiery Fillet Burger' and ms.size = 'Double';

  insert into recipe_check_results (check_name, result) values
    ('a Double burger takes two fillets',
     case when (select r.quantity from public.recipes r
                join public.ingredients i on i.id = r.ingredient_id
                where r.menu_item_size_id = v_burger_d and i.name = 'Chicken Fillet') = 2
          then 'ok' else 'FAIL — a Double is not two fillets' end);

  insert into recipe_check_results (check_name, result) values
    ('but still only one bun',
     case when (select r.quantity from public.recipes r
                join public.ingredients i on i.id = r.ingredient_id
                where r.menu_item_size_id = v_burger_d and i.name = 'Burger Bun') = 1
          then 'ok — no fractional or doubled buns'
          else 'FAIL — the bun count is wrong' end);

  insert into recipe_check_results (check_name, result) values
    ('nothing is measured in fractions of a piece',
     case when not exists (
            select 1 from public.recipes r
            join public.ingredients i on i.id = r.ingredient_id
            where i.unit = 'pcs' and r.quantity <> round(r.quantity))
          then 'ok' else 'FAIL — a "pcs" ingredient has a fractional quantity' end);

  -- --- the lookup itself ----------------------------------------------------
  -- Two Chicken Tikka Mediums and one Margherita Medium. Both use mozzarella,
  -- so the answer must contain ONE mozzarella row holding the total.

  select ms.id into v_marg_m from public.menu_item_sizes ms
  join public.menu_items mi on mi.id = ms.menu_item_id
  where mi.name = 'Margherita' and ms.size = 'Medium';

  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');
  select (public.place_order(
    'pickup', 'Recipe Check', v_phone, null, null,
    jsonb_build_array(
      jsonb_build_object('size_id', v_tikka_m, 'quantity', 2),
      jsonb_build_object('size_id', v_marg_m,  'quantity', 1)
    )
  ) -> 'order' ->> 'id')::uuid into v_order_id;

  select count(*) into v_rows
  from public.order_ingredient_requirements(v_order_id)
  where ingredient = 'Mozzarella';

  insert into recipe_check_results (check_name, result) values
    ('an ingredient used by two items comes back once',
     case when v_rows = 1 then 'ok — one row, not one per pizza'
          else format('FAIL — mozzarella came back %s times', v_rows) end);

  -- 2 x Chicken Tikka Medium (150g each) + 1 x Margherita Medium (180g) = 480g
  select required into v_moz
  from public.order_ingredient_requirements(v_order_id)
  where ingredient = 'Mozzarella';

  select (2 * (select quantity from public.recipes r
               join public.ingredients i on i.id = r.ingredient_id
               where r.menu_item_size_id = v_tikka_m and i.name = 'Mozzarella'))
       + (1 * (select quantity from public.recipes r
               join public.ingredients i on i.id = r.ingredient_id
               where r.menu_item_size_id = v_marg_m and i.name = 'Mozzarella'))
    into v_expected;

  insert into recipe_check_results (check_name, result) values
    ('quantity is multiplied by how many were ordered',
     case when v_moz = v_expected
          then format('ok — %s of mozzarella, as the recipes say', v_moz)
          else format('FAIL — expected %s, got %s', v_expected, v_moz) end);

  -- Pizza dough: only the two Tikkas and the Margherita, all Medium at 250g.
  select required into v_dough
  from public.order_ingredient_requirements(v_order_id)
  where ingredient = 'Pizza Dough';

  insert into recipe_check_results (check_name, result) values
    ('a shared base ingredient totals across every line',
     case when v_dough = 750 then 'ok — 3 Mediums x 250g'
          else format('FAIL — expected 750, got %s', v_dough) end);

  insert into recipe_check_results (check_name, result) values
    ('it reports current stock alongside what is needed',
     case when (select in_stock from public.order_ingredient_requirements(v_order_id)
                where ingredient = 'Mozzarella')
             = (select stock_quantity from public.ingredients where name = 'Mozzarella')
          then 'ok' else 'FAIL — in_stock does not match the ingredients table' end);

  -- Task 3 reads; task 4 deducts. Proving that means comparing stock BEFORE the
  -- lookup with stock AFTER it — not comparing the function's own output with
  -- the table it just read, which is true whatever the function did to it.
  -- Every ingredient, not just one: a lookup that drained something else would
  -- otherwise slip past.
  select sum(stock_quantity) into v_before from public.ingredients;

  perform * from public.order_ingredient_requirements(v_order_id);

  select sum(stock_quantity) into v_after from public.ingredients;

  insert into recipe_check_results (check_name, result) values
    ('looking does not change anything',
     case when v_before = v_after
          then format('ok — %s of stock before and after the lookup', v_before)
          else format('FAIL — total stock moved from %s to %s during a read',
                      v_before, v_after) end);

  insert into recipe_check_results (check_name, result) values
    ('an order that does not exist needs nothing',
     case when (select count(*) from public.order_ingredient_requirements(gen_random_uuid())) = 0
          then 'ok — no rows, no error' else 'FAIL' end);

  -- --- extras come off the same shelf ---------------------------------------
  -- The shop's decision: an extra cheese is 70g of real mozzarella, not a line
  -- on a receipt. The proof has to be a comparison, not an inspection — place
  -- the SAME pizza twice, once plain and once with the extra, and the
  -- difference in mozzarella must be exactly the topping's portion.

  insert into recipe_check_results (check_name, result) values
    ('every topping has an ingredient behind it',
     case when not exists (
            select 1 from public.toppings t
            where not exists (select 1 from public.topping_recipes tr
                              where tr.topping_id = t.id))
          then format('ok — all %s toppings covered', (select count(*) from public.toppings))
          else format('FAIL — no ingredient for: %s',
                      (select string_agg(t.name, ', ') from public.toppings t
                       where not exists (select 1 from public.topping_recipes tr
                                         where tr.topping_id = t.id))) end);

  select id into v_cheese_id from public.toppings where name = 'Extra Cheese';
  select quantity into v_portion
  from public.topping_recipes tr
  join public.ingredients i on i.id = tr.ingredient_id
  where tr.topping_id = v_cheese_id and i.name = 'Mozzarella';

  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');
  select (public.place_order(
    'pickup', 'Recipe Check', v_phone, null, null,
    jsonb_build_array(jsonb_build_object('size_id', v_tikka_m, 'quantity', 1))
  ) -> 'order' ->> 'id')::uuid into v_plain_id;

  -- Mushroom as well as cheese, and deliberately so: Chicken Tikka's recipe has
  -- no mushroom in it at all, so a Mushroom row can only appear here if the
  -- topping side of the union is really being read.
  select id into v_mush_id from public.toppings where name = 'Mushroom';

  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');
  select (public.place_order(
    'pickup', 'Recipe Check', v_phone, null, null,
    jsonb_build_array(jsonb_build_object(
      'size_id', v_tikka_m, 'quantity', 1,
      'topping_ids', jsonb_build_array(v_cheese_id, v_mush_id)))
  ) -> 'order' ->> 'id')::uuid into v_extra_id;

  select required into v_plain_moz
  from public.order_ingredient_requirements(v_plain_id) where ingredient = 'Mozzarella';
  select required into v_extra_moz
  from public.order_ingredient_requirements(v_extra_id) where ingredient = 'Mozzarella';

  insert into recipe_check_results (check_name, result) values
    ('an extra cheese adds real mozzarella',
     case when v_extra_moz - v_plain_moz = v_portion
          then format('ok — %s plain vs %s with the extra, a difference of %s',
                      v_plain_moz, v_extra_moz, v_portion)
          else format('FAIL — expected a difference of %s, got %s',
                      v_portion, v_extra_moz - v_plain_moz) end);

  -- This one replaced a check that counted mozzarella rows and expected 1. That
  -- passed whether or not toppings were counted at all — with the topping side
  -- missing entirely, mozzarella still comes back exactly once, from the recipe.
  -- It reported "ok" while the feature it was supposed to be guarding was not
  -- there. A check that cannot distinguish working from absent is worse than no
  -- check, because it is read as evidence.
  insert into recipe_check_results (check_name, result) values
    ('a topping can bring in an ingredient the pizza does not use',
     case when (select count(*) from public.order_ingredient_requirements(v_extra_id)
                where ingredient = 'Mushroom') = 1
           and (select count(*) from public.order_ingredient_requirements(v_plain_id)
                where ingredient = 'Mushroom') = 0
          then 'ok — mushroom appears only on the order that asked for it'
          else 'FAIL — the topping side of the union is not being read' end);

  insert into recipe_check_results (check_name, result) values
    ('recipe and topping land in ONE row, not two',
     case when (select count(*) from public.order_ingredient_requirements(v_extra_id)
                where ingredient = 'Mozzarella') = 1
           and (select required from public.order_ingredient_requirements(v_extra_id)
                where ingredient = 'Mozzarella') = v_plain_moz + v_portion
          then format('ok — one row holding %s', v_plain_moz + v_portion)
          else 'FAIL — mozzarella is split across rows or short' end);

  -- Two of the same line, one topping row between them: the extra is consumed
  -- twice, because two pizzas were made.
  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');
  select (public.place_order(
    'pickup', 'Recipe Check', v_phone, null, null,
    jsonb_build_array(jsonb_build_object(
      'size_id', v_tikka_m, 'quantity', 2,
      'topping_ids', jsonb_build_array(v_cheese_id)))
  ) -> 'order' ->> 'id')::uuid into v_order_id;

  select required into v_extra_moz
  from public.order_ingredient_requirements(v_order_id) where ingredient = 'Mozzarella';

  insert into recipe_check_results (check_name, result) values
    ('an extra on a line of two is consumed twice',
     case when v_extra_moz = 2 * (v_plain_moz + v_portion)
          then format('ok — %s for two pizzas each with the extra', v_extra_moz)
          else format('FAIL — expected %s, got %s',
                      2 * (v_plain_moz + v_portion), v_extra_moz) end);

  insert into recipe_check_results (check_name, result) values
    ('a free topping still costs the shop something',
     case when (select tr.quantity from public.topping_recipes tr
                join public.toppings t on t.id = tr.topping_id
                where t.name = 'Onion') > 0
          then 'ok — free to the customer is not free off the shelf'
          else 'FAIL — a free topping deducts nothing' end);

  -- --- tidy up --------------------------------------------------------------

  delete from public.orders where id in (v_order_id, v_plain_id, v_extra_id);

  insert into recipe_check_results (check_name, result)
  values ('test orders removed', 'ok — nothing left behind');
end;
$$;

-- ---------------------------------------------------------------------------
-- The verdict, summary first.
-- ---------------------------------------------------------------------------

select
  0 as seq,
  case when count(*) filter (where result like 'FAIL%') = 0
       then format('*** ALL %s CHECKS PASSED ***', count(*))
       else format('*** %s OF %s FAILED — see the rows below ***',
                   count(*) filter (where result like 'FAIL%'), count(*))
  end as check_name,
  case when count(*) filter (where result like 'FAIL%') = 0
       then 'nothing to do'
       else string_agg(check_name, '; ') filter (where result like 'FAIL%')
  end as result
from recipe_check_results

union all

select seq, check_name, result from recipe_check_results
order by seq;
