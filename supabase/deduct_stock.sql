-- Forno Pizza — moving stock when an order is placed, and putting it back when
-- one is called off.
--
-- RUN ORDER: after schema.sql, seed_recipes.sql and recipes.sql. Then re-run
-- place_order.sql and order_status.sql, which call into these. Safe to re-run.
--
-- ATOMICITY
-- There is no transaction management in this file, and that is the point. A
-- plpgsql function already runs inside one, so deduct_order_stock() called from
-- place_order() shares place_order's transaction: if the stock runs out
-- half way down the ingredient list, the RAISE unwinds the order, its lines,
-- its toppings and every deduction already made, together. Part 3's requirement
-- that "an order should never confirm if the stock update fails" is met by not
-- doing anything clever rather than by doing something clever.
--
-- Neither function is callable from the browser. Both are SECURITY DEFINER over
-- a table no customer role can touch, and deduct_order_stock() in particular
-- would let anyone drain the shop's stock to zero by calling it in a loop
-- against their own order id.

-- ---------------------------------------------------------------------------
-- DID THIS ORDER EVER TAKE STOCK?
--
-- Added after a refund went wrong in exactly the way an unrecorded one always
-- will. Cleaning up test data handed every old order to restore_order_stock(),
-- including hundreds placed before the deduction existed. They had never taken
-- anything out, so giving it back invented inventory — mozzarella went up
-- thirteenfold and the shop's figures became fiction.
--
-- A refund has to know whether a charge happened. Nothing else can tell you:
-- not the status, not the date, not whether the rows look right. So the order
-- records it, and both functions read that flag rather than assuming.
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists stock_deducted boolean not null default false;

-- ---------------------------------------------------------------------------
-- NOTICING WHEN AN INGREDIENT GETS LOW
--
-- Called after every movement, in either direction, with the level before and
-- after. It fires on the CROSSING, not on the state.
--
-- That distinction is the whole design. "Stock is under the threshold" is true
-- of every order placed for the rest of the day once it happens, so alerting on
-- it would write a row per order and bury the Manager in a hundred copies of
-- one fact. A crossing happens once — when mozzarella goes from 5,100g to
-- 4,900g — and does not happen again until something has put it back above
-- 5,000g first.
--
-- Which also means the re-arming is free. There is no "have I already warned
-- about this" bookkeeping, because stock physically cannot cross downwards
-- twice without crossing upwards in between.
--
-- A threshold of 0 disables alerting for that ingredient, and needs no special
-- case: stock can never fall below zero, so the downward test can never be
-- true.
-- ---------------------------------------------------------------------------

create or replace function public.note_stock_level(
  p_ingredient_id uuid,
  p_before        numeric,
  p_after         numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_threshold numeric;
  v_name      text;
begin
  select low_stock_threshold, name into v_threshold, v_name
  from public.ingredients
  where id = p_ingredient_id;

  if not found then
    return;
  end if;

  -- Crossed DOWN. One row, for the Manager to see in Part 4.
  if p_before >= v_threshold and p_after < v_threshold then
    insert into public.stock_alerts (ingredient_id, stock_at_trigger)
    values (p_ingredient_id, p_after);

    -- Also goes to the Postgres log, where it is timestamped and searchable
    -- even before anything exists to display it.
    raise notice 'low stock: % down to % (threshold %)', v_name, p_after, v_threshold;

  -- Crossed UP. Whatever was raised is no longer true, so it stops being an
  -- active alert rather than sitting on the Manager's screen for ever.
  elsif p_before < v_threshold and p_after >= v_threshold then
    update public.stock_alerts
       set resolved_at = now()
     where ingredient_id = p_ingredient_id
       and resolved_at is null;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- TAKING STOCK OUT
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- TAKING STOCK OUT
-- ---------------------------------------------------------------------------

create or replace function public.deduct_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_need   record;
  v_have   numeric;
  v_after  numeric;
  v_sizes  int;
  v_costed int;
begin
  -- -------------------------------------------------------------------------
  -- COVERAGE
  --
  -- A sellable size with no recipe consumes nothing, for ever, and no error is
  -- raised anywhere — the order simply goes through and the shop's count drifts
  -- away from its shelves. Refusing is the louder failure and the better one:
  -- nobody can order the new pizza, which is noticed the same afternoon, rather
  -- than in a month when the stock count is inexplicably wrong.
  --
  -- It cannot fire today (every size is covered — see sizes_missing_recipes()).
  -- It is here for the day someone adds a menu item in Part 4 and forgets.
  -- -------------------------------------------------------------------------

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

  -- -------------------------------------------------------------------------
  -- LOCK, CHECK, DEDUCT — one ingredient at a time, always in the same order.
  --
  -- ORDER BY ingredient_id is not cosmetic. Two orders placed at the same
  -- instant that share ingredients will queue on the same rows; if one took
  -- mozzarella then onion while the other took onion then mozzarella, each
  -- would sit holding what the other needed. Postgres would spot the deadlock
  -- and kill one of them, and a customer would see a failure that had nothing
  -- to do with stock. A single agreed order means the second one simply waits.
  --
  -- The requirements function reports in_stock too, but it is STABLE and read
  -- that number before any lock was taken. The figure that decides is the one
  -- re-read here, under FOR UPDATE.
  --
  -- WHY THAT RE-READ IS THE WHOLE THING.
  -- On the default READ COMMITTED isolation, a SELECT ... FOR UPDATE that hits
  -- a row another transaction is holding does not fail and does not read a
  -- stale copy: it waits, and when the other transaction commits it re-reads
  -- the row as that transaction left it. So the second of two orders for the
  -- last unit sees the stock AFTER the first took it, and refuses. That single
  -- behaviour is what stops the shop overselling, and it is why the check has
  -- to sit between the lock and the update rather than anywhere more
  -- convenient.
  -- -------------------------------------------------------------------------

  for v_need in
    select ingredient_id, required
    from public.order_ingredient_requirements(p_order_id)
    order by ingredient_id
  loop
    select stock_quantity into v_have
    from public.ingredients
    where id = v_need.ingredient_id
    for update;

    -- SELECT ... INTO leaves the variable UNTOUCHED when nothing matches — it
    -- does not set it to null. Without this, a missing ingredient row would
    -- silently reuse the previous loop iteration's figure, pass the check
    -- against the wrong number, and then update nothing at all. Ingredients are
    -- ON DELETE RESTRICT from recipes so it should be unreachable; it is
    -- checked because the failure would be invisible rather than loud.
    if not found then
      raise exception 'ingredient_missing';
    end if;

    -- Deliberately says only that something ran out. Naming the ingredient
    -- would hand a customer the recipe, and quoting the shortfall would hand
    -- them the shop's stock level.
    if v_have < v_need.required then
      raise exception 'out_of_stock';
    end if;

    -- `stock_quantity - v_need.required`, never `v_have - v_need.required`.
    --
    -- They look equivalent because the row is locked, and they are — today. But
    -- the first re-reads the live value inside the statement, so it stays
    -- correct even if the lock above were ever weakened or removed; the second
    -- writes back a number remembered from before, which would silently erase a
    -- concurrent deduction and oversell. Together with the `stock_quantity >= 0`
    -- check constraint in schema.sql, that makes three independent things that
    -- would each have to fail before the shop could sell food it does not have:
    -- the lock, the live re-read, and the constraint.
    --
    -- supabase/mutation_test_oversell.sql breaks the first two on purpose, to
    -- prove tests/concurrency.test.js actually notices.
    update public.ingredients
       set stock_quantity = stock_quantity - v_need.required
     where id = v_need.ingredient_id
    returning stock_quantity into v_after;

    -- Still holding the row lock, so nothing can move between the write and
    -- the check. v_have is the level before, read under that same lock.
    perform public.note_stock_level(v_need.ingredient_id, v_have, v_after);
  end loop;

  -- Only now, once every ingredient is actually out. If the loop above raised,
  -- this never runs and the transaction unwinds anyway — but the flag says what
  -- happened rather than what was attempted.
  update public.orders set stock_deducted = true where id = p_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- PUTTING STOCK BACK
--
-- Not in Part 3's task list, and built anyway, because the two features it sits
-- between make each other wrong without it. Task 2 lets a customer cancel while
-- the order is still waiting; task 4 takes the stock at the moment the order is
-- placed. Together, and with nothing here, every cancelled order permanently
-- eats ingredients that were never cooked.
--
-- Safe by construction: cancelling is only allowed while the status is still
-- 'placed', and every order that reaches 'placed' has been through
-- deduct_order_stock(). So there is no path where this gives back something
-- that was never taken.
-- ---------------------------------------------------------------------------

create or replace function public.restore_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_need  record;
  v_after numeric;
  v_taken boolean;
begin
  -- The guard that was missing. An order only gets its ingredients back if it
  -- took them in the first place, and only once: the flag is cleared at the end,
  -- so calling this twice is a no-op rather than a second helping.
  --
  -- Locked, because a cancellation and a clean-up could both reach the same
  -- order at the same moment and both read "yes, deducted".
  select stock_deducted into v_taken
  from public.orders where id = p_order_id
  for update;

  if not coalesce(v_taken, false) then
    return;
  end if;

  -- Same lock order as the deduction, for the same reason: a cancellation and a
  -- new order can be in flight at the same moment and touch the same shelves.
  for v_need in
    select ingredient_id, required
    from public.order_ingredient_requirements(p_order_id)
    order by ingredient_id
  loop
    update public.ingredients
       set stock_quantity = stock_quantity + v_need.required
     where id = v_need.ingredient_id
    returning stock_quantity into v_after;

    -- A refund can lift an ingredient back over its threshold, and an alert
    -- that is no longer true should not still be sitting on the Manager's
    -- screen. Part 4's add-stock screen will call the same function.
    perform public.note_stock_level(v_need.ingredient_id, v_after - v_need.required, v_after);
  end loop;

  update public.orders set stock_deducted = false where id = p_order_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- ACCESS
--
-- The most important revoke in the project. Both are SECURITY DEFINER, so the
-- default grant to PUBLIC would let any anonymous visitor call
-- deduct_order_stock() in a loop against their own order id and empty the
-- shop's stock, or call restore_order_stock() to invent inventory that does not
-- exist. They are only ever called from inside place_order() and
-- cancel_order(), which run as the owner and need no grant.
-- ---------------------------------------------------------------------------

revoke execute on function public.deduct_order_stock(uuid)  from public;
revoke execute on function public.restore_order_stock(uuid) from public;

-- note_stock_level() writes to stock_alerts, which no customer role can read or
-- write. Left callable, anyone could fill the Manager's alert list with noise.
revoke execute on function public.note_stock_level(uuid, numeric, numeric) from public;
