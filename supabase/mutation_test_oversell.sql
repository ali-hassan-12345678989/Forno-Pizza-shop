-- ===========================================================================
-- DELIBERATELY BROKEN. DO NOT LEAVE THIS APPLIED.
-- ===========================================================================
--
-- This replaces deduct_order_stock() with a version that oversells, on purpose,
-- so that tests/concurrency.test.js can be shown to FAIL. A concurrency test
-- that has never failed is not evidence of anything — it might be asserting
-- something that is true whatever the code does.
--
-- TO UNDO: re-run supabase/deduct_stock.sql. That is the whole restore.
--
-- WHAT IS BROKEN, AND WHY THIS PARTICULAR BREAK
--
-- Two changes, both of them mistakes a person would actually make:
--
--   1. The row is read WITHOUT `for update`. Two orders can now read the same
--      stock level at the same moment instead of queueing.
--
--   2. The update writes `v_have - required` — the number it read earlier —
--      rather than `stock_quantity - required`.
--
-- The second is what makes it silent. With change 1 alone, the second order's
-- UPDATE would still wait on the row and then recompute from the committed
-- value, hit the `stock_quantity >= 0` check constraint, and be refused: ugly,
-- but not an oversell. Writing back a remembered number instead of a fresh one
-- steps around the constraint entirely, and both orders succeed against stock
-- that only covered one.
--
-- That is the exact failure this task exists to prevent, so it is the exact
-- failure the test has to be able to see.

create or replace function public.deduct_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_need   record;
  v_have   numeric;
  v_sizes  int;
  v_costed int;
begin
  select count(distinct oi.menu_item_size_id) into v_sizes
  from public.order_items oi
  where oi.order_id = p_order_id;

  select count(distinct oi.menu_item_size_id) into v_costed
  from public.order_items oi
  where oi.order_id = p_order_id
    and exists (select 1 from public.recipes r where r.menu_item_size_id = oi.menu_item_size_id);

  if v_sizes <> v_costed then
    raise exception 'recipe_missing';
  end if;

  for v_need in
    select ingredient_id, required
    from public.order_ingredient_requirements(p_order_id)
    order by ingredient_id
  loop
    -- BROKEN 1: no `for update`, so nothing queues.
    select stock_quantity into v_have
    from public.ingredients
    where id = v_need.ingredient_id;

    if not found then
      raise exception 'ingredient_missing';
    end if;

    if v_have < v_need.required then
      raise exception 'out_of_stock';
    end if;

    -- BROKEN 2: writes back a remembered figure rather than the live one, so
    -- the second writer silently erases the first writer's deduction.
    update public.ingredients
       set stock_quantity = v_have - v_need.required
     where id = v_need.ingredient_id;
  end loop;

  update public.orders set stock_deducted = true where id = p_order_id;
end;
$$;

revoke execute on function public.deduct_order_stock(uuid) from public;

-- Confirms the break actually took, rather than trusting that it did.
--
-- It looks for `set stock_quantity = v_have`, which exists ONLY in the broken
-- version's code. An earlier version of this check searched for "for update"
-- and matched the comment a few lines above that says there is no `for update`
-- — so it reported "not applied" whatever the state actually was.
select
  case
    when pg_get_functiondef('public.deduct_order_stock(uuid)'::regprocedure)
         ilike '%set stock_quantity = v_have%'
    then '*** OVERSELLING IS NOW ENABLED — re-run deduct_stock.sql to undo ***'
    else '*** NOT APPLIED — the safe version is still live ***'
  end as state;
