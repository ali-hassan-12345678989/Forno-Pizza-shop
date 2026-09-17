-- Forno Pizza — proving stock actually moves, and unmoves.
--
-- Run in the Supabase SQL Editor: paste the whole file, run it once, read the
-- verdict row at the top. Every row should say "ok".
--
-- RUN ORDER: after deduct_stock.sql, and after re-running place_order.sql and
-- order_status.sql so that they call into it.
--
-- WHY THIS FILE EXISTS
-- deduct_order_stock() is revoked from every customer role — it has to be, or
-- anyone could empty the shop by calling it in a loop. So the integration suite
-- can only prove it refuses to talk to them. Whether stock moves by the right
-- amount, and whether a shortage really unwinds the whole order, has to be
-- checked from a session that can see the ingredients table.
--
-- Leaves nothing behind: every order, ingredient level and scratch menu item it
-- touches is put back at the end.

drop table if exists stock_check_results;
create temporary table stock_check_results (seq serial, check_name text, result text);

-- Every ingredient level, captured immediately before something is meant to
-- move them. Comparing the whole table afterwards is the only way to show both
-- that the right things moved AND that nothing else did — checking a single
-- ingredient proves the loop ran once, not that it ran correctly.
drop table if exists stock_before;
create temporary table stock_before (ingredient_id uuid primary key, qty numeric);

create or replace function pg_temp.expect_error(p_sql text, p_code text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return format('FAIL — expected %s, but it was allowed', p_code);
exception when others then
  if sqlerrm = p_code then return format('ok — refused with %s', p_code); end if;
  return format('FAIL — expected %s, got "%s"', p_code, sqlerrm);
end;
$$;

do $$
declare
  v_tikka_m    uuid;
  v_cheese_id  uuid;
  v_moz_id     uuid;
  v_order_id   uuid;
  v_phone      text;

  v_moz_before numeric;
  v_moz_after  numeric;
  v_moz_saved  numeric;
  v_need       numeric;
  v_portion    numeric;
  v_orders     int;
  v_negatives  int;
  v_mismatched int;
  v_strays     int;

  v_basil_id     uuid;
  v_basil_stock  numeric;
  v_basil_thresh numeric;
  v_marg_m       uuid;
  v_alerts       int;
  v_open         int;
  v_id           uuid;
  v_marg_item    uuid;
  v_affected     int;

  v_tmp_item   uuid;
  v_tmp_size   uuid;
begin
  select ms.id into v_tikka_m
  from public.menu_item_sizes ms
  join public.menu_items mi on mi.id = ms.menu_item_id
  where mi.name = 'Chicken Tikka' and ms.size = 'Medium';

  select id into v_cheese_id from public.toppings   where name = 'Extra Cheese';
  select id into v_moz_id    from public.ingredients where name = 'Mozzarella';

  select quantity into v_portion
  from public.topping_recipes tr
  where tr.topping_id = v_cheese_id and tr.ingredient_id = v_moz_id;

  select quantity into v_need
  from public.recipes
  where menu_item_size_id = v_tikka_m and ingredient_id = v_moz_id;

  -- --- one order moves stock by exactly what it needs ------------------------

  select stock_quantity into v_moz_before from public.ingredients where id = v_moz_id;

  delete from stock_before;
  insert into stock_before select id, stock_quantity from public.ingredients;

  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');
  select (public.place_order(
    'pickup', 'Stock Check', v_phone, null, null,
    jsonb_build_array(jsonb_build_object('size_id', v_tikka_m, 'quantity', 1))
  ) -> 'order' ->> 'id')::uuid into v_order_id;

  select stock_quantity into v_moz_after from public.ingredients where id = v_moz_id;

  insert into stock_check_results (check_name, result) values
    ('placing an order takes stock out',
     case when v_moz_before - v_moz_after = v_need
          then format('ok — mozzarella %s to %s, exactly the %s the recipe calls for',
                      v_moz_before, v_moz_after, v_need)
          else format('FAIL — expected a drop of %s, got %s',
                      v_need, v_moz_before - v_moz_after) end);

  -- Every ingredient the order needs, down by exactly what it needed.
  --
  -- This replaced a check that could not fail: it looked for requirement rows
  -- whose ingredient was NOT in the requirement list, which is nothing, always.
  -- It reported "ok — 7 ingredients drawn down" without reading a single stock
  -- level.
  select count(*) into v_mismatched
  from public.order_ingredient_requirements(v_order_id) r
  join stock_before b       on b.ingredient_id = r.ingredient_id
  join public.ingredients i on i.id = r.ingredient_id
  where b.qty - i.stock_quantity <> r.required;

  insert into stock_check_results (check_name, result) values
    ('every ingredient on the order moved by exactly its requirement',
     case when v_mismatched = 0
          then format('ok — all %s of them',
                      (select count(*) from public.order_ingredient_requirements(v_order_id)))
          else format('FAIL — %s ingredient(s) moved by the wrong amount', v_mismatched) end);

  -- The other side of it: the loop must not have wandered off its list.
  select count(*) into v_strays
  from stock_before b
  join public.ingredients i on i.id = b.ingredient_id
  where b.qty <> i.stock_quantity
    and b.ingredient_id not in (
      select ingredient_id from public.order_ingredient_requirements(v_order_id));

  insert into stock_check_results (check_name, result) values
    ('nothing the order did not need was touched',
     case when v_strays = 0 then 'ok — no collateral deductions'
          else format('FAIL — %s ingredient(s) moved that were not on the order', v_strays) end);

  -- --- cancelling gives it back ---------------------------------------------

  perform public.cancel_order(
    (select access_token from public.orders where id = v_order_id));

  select stock_quantity into v_moz_after from public.ingredients where id = v_moz_id;

  insert into stock_check_results (check_name, result) values
    ('cancelling puts the stock back',
     case when v_moz_after = v_moz_before
          then format('ok — back to %s, net zero', v_moz_before)
          else format('FAIL — expected %s after the refund, got %s',
                      v_moz_before, v_moz_after) end);

  insert into stock_check_results (check_name, result) values
    ('a second cancel does not refund twice',
     pg_temp.expect_error(
       format('select public.cancel_order((select access_token from public.orders where id = %L))',
              v_order_id),
       'already_cancelled'));

  select stock_quantity into v_moz_after from public.ingredients where id = v_moz_id;

  insert into stock_check_results (check_name, result) values
    ('and stock is still where it should be after that',
     case when v_moz_after = v_moz_before
          then 'ok — the refused cancel refunded nothing'
          else format('FAIL — stock is %s, expected %s', v_moz_after, v_moz_before) end);

  delete from public.orders where id = v_order_id;

  -- --- an extra comes off the shelf too --------------------------------------

  select stock_quantity into v_moz_before from public.ingredients where id = v_moz_id;

  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');
  select (public.place_order(
    'pickup', 'Stock Check', v_phone, null, null,
    jsonb_build_array(jsonb_build_object(
      'size_id', v_tikka_m, 'quantity', 1,
      'topping_ids', jsonb_build_array(v_cheese_id)))
  ) -> 'order' ->> 'id')::uuid into v_order_id;

  select stock_quantity into v_moz_after from public.ingredients where id = v_moz_id;

  insert into stock_check_results (check_name, result) values
    ('an extra cheese really leaves the fridge',
     case when v_moz_before - v_moz_after = v_need + v_portion
          then format('ok — %s for the pizza plus %s for the extra', v_need, v_portion)
          else format('FAIL — expected a drop of %s, got %s',
                      v_need + v_portion, v_moz_before - v_moz_after) end);

  delete from public.orders where id = v_order_id;
  update public.ingredients set stock_quantity = v_moz_before where id = v_moz_id;

  -- --- a shortage unwinds the WHOLE order ------------------------------------
  -- Part 3: "an order should never confirm if the stock update fails". The two
  -- checks that matter are that the order does not exist afterwards, and that
  -- nothing else on it was quietly drawn down on the way to the ingredient that
  -- ran out.

  select stock_quantity into v_moz_saved from public.ingredients where id = v_moz_id;
  update public.ingredients set stock_quantity = 10 where id = v_moz_id;

  delete from stock_before;
  insert into stock_before select id, stock_quantity from public.ingredients;

  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');

  insert into stock_check_results (check_name, result) values
    ('an order the kitchen cannot make is refused',
     pg_temp.expect_error(
       format($fmt$select public.place_order('pickup', 'Atomicity Check', %L, null, null,
                jsonb_build_array(jsonb_build_object('size_id', %L, 'quantity', 1)))$fmt$,
              v_phone, v_tikka_m),
       'out_of_stock'));

  select count(*) into v_orders
  from public.orders where customer_name = 'Atomicity Check';

  insert into stock_check_results (check_name, result) values
    ('the refused order does not exist',
     case when v_orders = 0 then 'ok — no order, no line items, nothing'
          else format('FAIL — %s order(s) were left behind by a failed place_order',
                      v_orders) end);

  select stock_quantity into v_moz_after from public.ingredients where id = v_moz_id;

  insert into stock_check_results (check_name, result) values
    ('the ingredient that ran out was not touched',
     case when v_moz_after = 10 then 'ok — still 10'
          else format('FAIL — expected 10, got %s', v_moz_after) end);

  insert into stock_check_results (check_name, result) values
    -- The sharp one. Mozzarella sits in the middle of the ingredient ids, so
    -- the loop will have locked and deducted several OTHER ingredients before
    -- reaching the one that ran out. If those survived, the shop just lost
    -- dough and sauce to an order that never existed.
    ('nor was anything else on that order',
     case when (select count(*) from stock_before b
                join public.ingredients i on i.id = b.ingredient_id
                where b.qty <> i.stock_quantity) = 0
          then 'ok — every ingredient is exactly where it was'
          else format('FAIL — %s ingredient(s) stayed deducted after the order failed',
                      (select count(*) from stock_before b
                       join public.ingredients i on i.id = b.ingredient_id
                       where b.qty <> i.stock_quantity)) end);

  update public.ingredients set stock_quantity = v_moz_saved where id = v_moz_id;

  -- --- a refund only happens if a charge did, and only once ------------------
  -- These two are here because their absence cost the shop half a tonne of
  -- imaginary pizza dough. restore_order_stock() used to give ingredients back
  -- to any order it was handed, so a clean-up that swept historical orders —
  -- placed long before the deduction was built — refunded charges that had
  -- never been made.

  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');
  select (public.place_order(
    'pickup', 'Stock Check', v_phone, null, null,
    jsonb_build_array(jsonb_build_object('size_id', v_tikka_m, 'quantity', 1))
  ) -> 'order' ->> 'id')::uuid into v_order_id;

  insert into stock_check_results (check_name, result) values
    ('placing an order records that it took stock',
     case when (select stock_deducted from public.orders where id = v_order_id)
          then 'ok — flagged' else 'FAIL — the order does not know it was charged' end);

  select stock_quantity into v_moz_before from public.ingredients where id = v_moz_id;

  perform public.restore_order_stock(v_order_id);
  select stock_quantity into v_moz_after from public.ingredients where id = v_moz_id;

  insert into stock_check_results (check_name, result) values
    ('a refund gives back exactly what was taken',
     case when v_moz_after - v_moz_before = v_need
          then format('ok — %s returned', v_need)
          else format('FAIL — expected %s back, got %s', v_need, v_moz_after - v_moz_before) end);

  -- Second refund, same order. Must do nothing at all.
  perform public.restore_order_stock(v_order_id);

  insert into stock_check_results (check_name, result) values
    ('refunding the same order twice gives nothing back',
     case when (select stock_quantity from public.ingredients where id = v_moz_id) = v_moz_after
          then 'ok — the second refund was a no-op'
          else format('FAIL — a second refund added %s more',
                      (select stock_quantity from public.ingredients where id = v_moz_id)
                      - v_moz_after) end);

  -- An order that never took stock: exactly the historical rows that caused the
  -- damage. Refunding one must change nothing.
  delete from stock_before;
  insert into stock_before select id, stock_quantity from public.ingredients;

  update public.orders set stock_deducted = false where id = v_order_id;
  perform public.restore_order_stock(v_order_id);

  select count(*) into v_strays
  from stock_before b
  join public.ingredients i on i.id = b.ingredient_id
  where b.qty <> i.stock_quantity;

  insert into stock_check_results (check_name, result) values
    ('an order that never took stock is not refunded',
     case when v_strays = 0
          then 'ok — nothing invented'
          else format('FAIL — %s ingredient(s) gained stock from an uncharged order',
                      v_strays) end);

  delete from public.orders where id = v_order_id;

  -- --- stock can never go below zero ----------------------------------------

  select count(*) into v_negatives
  from public.ingredients where stock_quantity < 0;

  insert into stock_check_results (check_name, result) values
    ('no ingredient is ever negative',
     case when v_negatives = 0 then 'ok'
          else format('FAIL — %s ingredient(s) are below zero', v_negatives) end);

  -- --- a size with no recipe is refused, not silently free -------------------
  -- The guard that cannot fire today. A scratch menu item with no recipe is the
  -- only way to reach it, so this builds one and takes it away again.

  insert into public.menu_items (name, description, is_active, is_sold_out)
  values ('ZZ Scratch Item', 'temporary, created by verify_stock.sql', true, false)
  returning id into v_tmp_item;

  insert into public.menu_item_sizes (menu_item_id, size, price, sort_order)
  values (v_tmp_item, 'Medium', 100, 1)
  returning id into v_tmp_size;

  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');

  insert into stock_check_results (check_name, result) values
    ('a menu item with no recipe cannot be ordered',
     pg_temp.expect_error(
       format($fmt$select public.place_order('pickup', 'Atomicity Check', %L, null, null,
                jsonb_build_array(jsonb_build_object('size_id', %L, 'quantity', 1)))$fmt$,
              v_phone, v_tmp_size),
       'recipe_missing'));

  delete from public.menu_items where id = v_tmp_item;

  insert into stock_check_results (check_name, result) values
    ('the scratch item is gone again',
     case when not exists (select 1 from public.menu_items where id = v_tmp_item)
          then 'ok' else 'FAIL — a scratch menu item is still on the menu' end);

  -- --- low stock alerts ------------------------------------------------------
  -- Fresh Basil is used by exactly one pizza (Margherita), so its level can be
  -- driven precisely without anything else on the menu interfering.

  select id, stock_quantity, low_stock_threshold
    into v_basil_id, v_basil_stock, v_basil_thresh
  from public.ingredients where name = 'Fresh Basil';

  select ms.id into v_marg_m
  from public.menu_item_sizes ms
  join public.menu_items mi on mi.id = ms.menu_item_id
  where mi.name = 'Margherita' and ms.size = 'Medium';

  -- Start from a clean slate for this one ingredient, and park it just ABOVE
  -- the threshold so the very next order has to cross it.
  delete from public.stock_alerts where ingredient_id = v_basil_id;
  update public.ingredients
     set stock_quantity = low_stock_threshold + 2
   where id = v_basil_id;

  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');
  perform public.place_order('pickup', 'Alert Check', v_phone, null, null,
    jsonb_build_array(jsonb_build_object('size_id', v_marg_m, 'quantity', 1)));

  select count(*) into v_alerts
  from public.stock_alerts where ingredient_id = v_basil_id;

  insert into stock_check_results (check_name, result) values
    ('crossing the threshold raises one alert',
     case when v_alerts = 1 then 'ok'
          else format('FAIL — expected 1 alert, found %s', v_alerts) end);

  insert into stock_check_results (check_name, result) values
    ('the alert records the level that triggered it',
     case when (select a.stock_at_trigger from public.stock_alerts a
                where a.ingredient_id = v_basil_id)
            = (select stock_quantity from public.ingredients where id = v_basil_id)
          then format('ok — %s', (select stock_quantity from public.ingredients where id = v_basil_id))
          else 'FAIL — stock_at_trigger does not match the level it fell to' end);

  -- THE POINT OF CROSSING RATHER THAN STATE. Two more orders, both of them
  -- below the threshold the whole time. Neither is a crossing, so neither is
  -- news, and the Manager must not get three copies of the same warning.
  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');
  perform public.place_order('pickup', 'Alert Check', v_phone, null, null,
    jsonb_build_array(jsonb_build_object('size_id', v_marg_m, 'quantity', 1)));

  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');
  perform public.place_order('pickup', 'Alert Check', v_phone, null, null,
    jsonb_build_array(jsonb_build_object('size_id', v_marg_m, 'quantity', 1)));

  select count(*) into v_alerts
  from public.stock_alerts where ingredient_id = v_basil_id;

  insert into stock_check_results (check_name, result) values
    ('staying low does not raise the same alert again',
     case when v_alerts = 1
          then 'ok — still one, after two more orders below the line'
          else format('FAIL — %s alerts; it is firing on the state, not the crossing', v_alerts) end);

  -- Put the ingredient back over the line. The warning is no longer true, so it
  -- should stop being an active one.
  update public.ingredients
     set stock_quantity = low_stock_threshold + 500
   where id = v_basil_id;
  perform public.note_stock_level(v_basil_id, v_basil_thresh - 1, v_basil_thresh + 500);

  select count(*) into v_open
  from public.stock_alerts where ingredient_id = v_basil_id and resolved_at is null;

  insert into stock_check_results (check_name, result) values
    ('coming back above the line resolves the alert',
     case when v_open = 0 then 'ok — nothing left on the Manager''s active list'
          else format('FAIL — %s alert(s) still active after a restock', v_open) end);

  -- And it re-arms: crossing down a second time is genuinely new.
  update public.ingredients
     set stock_quantity = low_stock_threshold + 2
   where id = v_basil_id;

  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');
  perform public.place_order('pickup', 'Alert Check', v_phone, null, null,
    jsonb_build_array(jsonb_build_object('size_id', v_marg_m, 'quantity', 1)));

  select count(*) into v_alerts from public.stock_alerts where ingredient_id = v_basil_id;
  select count(*) into v_open
  from public.stock_alerts where ingredient_id = v_basil_id and resolved_at is null;

  insert into stock_check_results (check_name, result) values
    ('a second crossing after a restock is news again',
     case when v_alerts = 2 and v_open = 1
          then 'ok — two crossings, two alerts, one of them still open'
          else format('FAIL — %s alerts, %s open', v_alerts, v_open) end);

  -- An order that does not go near the threshold must say nothing at all.
  update public.ingredients
     set stock_quantity = low_stock_threshold * 10
   where id = v_basil_id;
  delete from public.stock_alerts where ingredient_id = v_basil_id;

  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');
  perform public.place_order('pickup', 'Alert Check', v_phone, null, null,
    jsonb_build_array(jsonb_build_object('size_id', v_marg_m, 'quantity', 1)));

  select count(*) into v_alerts from public.stock_alerts where ingredient_id = v_basil_id;

  insert into stock_check_results (check_name, result) values
    ('an ordinary order raises nothing',
     case when v_alerts = 0 then 'ok — silence when there is nothing to say'
          else format('FAIL — %s alert(s) from an order nowhere near the line', v_alerts) end);

  -- Hand back everything those five Margheritas consumed, BEFORE deleting them.
  --
  -- Deleting the rows is not enough and never was: the ingredients left the
  -- building when the orders were placed. An earlier version of this section
  -- only deleted, and the "stock is back where this file found it" check caught
  -- it — mozzarella 900g short, which is exactly five Margheritas at 180g.
  -- Once the lines are gone there is nothing left to say what was consumed.
  for v_id in select id from public.orders where customer_name = 'Alert Check' loop
    perform public.restore_order_stock(v_id);
  end loop;

  -- Put Fresh Basil back exactly as it was found. Done after the refunds, so
  -- this is the value that stands regardless of what they handed back.
  delete from public.stock_alerts where ingredient_id = v_basil_id;
  delete from public.orders where customer_name = 'Alert Check';
  update public.ingredients
     set stock_quantity = v_basil_stock
   where id = v_basil_id;

  insert into stock_check_results (check_name, result) values
    ('fresh basil is back where this file found it',
     case when (select stock_quantity from public.ingredients where id = v_basil_id) = v_basil_stock
          then format('ok — %s', v_basil_stock)
          else 'FAIL — basil was left at the wrong level' end);

  -- --- sold out, automatically -----------------------------------------------
  -- Part 3's acceptance test, word for word: "manually setting an ingredient to
  -- 0 stock causes the right pizza to show Sold out without touching any other
  -- code". Fresh Basil is used by Margherita and nothing else, so "the right
  -- pizza" is checkable rather than a figure of speech.

  select mi.id into v_marg_item from public.menu_items mi where mi.name = 'Margherita';
  select stock_quantity into v_basil_stock from public.ingredients where id = v_basil_id;

  -- Counted before and after, rather than as an absolute. Any other ingredient
  -- that happens to be at zero would otherwise make this fail for a reason that
  -- has nothing to do with basil.
  select count(*) into v_affected from public.menu_items where out_of_stock;

  update public.ingredients set stock_quantity = 0 where id = v_basil_id;

  insert into stock_check_results (check_name, result) values
    ('an ingredient at zero sells out the dish that needs it',
     case when (select out_of_stock from public.menu_items where id = v_marg_item)
          then 'ok — Margherita is unavailable'
          else 'FAIL — basil is at zero and Margherita is still on sale' end);

  insert into stock_check_results (check_name, result) values
    ('and sells out nothing else',
     case when (select count(*) from public.menu_items where out_of_stock) - v_affected = 1
          then 'ok — one dish, not the whole menu'
          else format('FAIL — %s dishes went unavailable on one ingredient',
                      (select count(*) from public.menu_items where out_of_stock) - v_affected) end);

  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');

  insert into stock_check_results (check_name, result) values
    ('and it cannot be ordered either',
     pg_temp.expect_error(
       format($fmt$select public.place_order('pickup', 'Sold Out Check', %L, null, null,
                jsonb_build_array(jsonb_build_object('size_id', %L, 'quantity', 1)))$fmt$,
              v_phone, v_marg_m),
       'item_unavailable'));

  -- A delivery arrives.
  update public.ingredients set stock_quantity = v_basil_stock where id = v_basil_id;

  insert into stock_check_results (check_name, result) values
    ('restocking puts it back on the menu by itself',
     case when not (select out_of_stock from public.menu_items where id = v_marg_item)
          then 'ok — no manual step'
          else 'FAIL — still flagged unavailable after a restock' end);

  -- THE REASON THERE ARE TWO FLAGS. A dish the shop pulled by hand must stay
  -- pulled when the ingredients come back; the oven being broken is not fixed
  -- by a delivery of basil.
  update public.menu_items set is_sold_out = true where id = v_marg_item;
  update public.ingredients set stock_quantity = 0 where id = v_basil_id;
  update public.ingredients set stock_quantity = v_basil_stock where id = v_basil_id;

  insert into stock_check_results (check_name, result) values
    ('a dish pulled by hand stays pulled through a restock',
     case when (select is_sold_out from public.menu_items where id = v_marg_item)
           and not (select out_of_stock from public.menu_items where id = v_marg_item)
          then 'ok — the engine did not overwrite the shop''s decision'
          else 'FAIL — a restock un-pulled a dish somebody deliberately pulled' end);

  update public.menu_items set is_sold_out = false where id = v_marg_item;
  delete from public.orders where customer_name = 'Sold Out Check';

  insert into stock_check_results (check_name, result) values
    ('the menu is back as it was',
     case when not exists (
            select 1 from public.menu_items
            where out_of_stock and name = 'Margherita')
          then 'ok'
          else 'FAIL — Margherita was left unavailable' end);

  -- --- tidy up ---------------------------------------------------------------

  delete from public.orders where customer_name in ('Stock Check', 'Atomicity Check');

  insert into stock_check_results (check_name, result) values
    ('stock is back where this file found it',
     case when (select stock_quantity from public.ingredients where id = v_moz_id) = v_moz_saved
          then format('ok — mozzarella at %s', v_moz_saved)
          else format('FAIL — mozzarella is %s, started at %s',
                      (select stock_quantity from public.ingredients where id = v_moz_id),
                      v_moz_saved) end);
end;
$$;

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
from stock_check_results

union all

select seq, check_name, result from stock_check_results
order by seq;
