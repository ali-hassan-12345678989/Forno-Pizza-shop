-- ---------------------------------------------------------------------------
-- Forno Pizza — the stock ledger, and what it is for.
--
-- RUN ORDER: after schema.sql, deduct_stock.sql, receive_stock.sql and
-- staff_roles.sql. Safe to re-run. Self-contained: it also redefines the three
-- functions that move stock, so this is the only file to run.
--
-- WHAT WAS MISSING
-- `ingredients.stock_quantity` is a running total and nothing else. It says how
-- much mozzarella is on the shelf; it cannot say how much was used today,
-- because using 15kg and then taking a 15kg delivery leaves the same number
-- behind as a quiet afternoon. stock_alerts only records threshold crossings.
-- So "how much cheese did we use" had no stored answer anywhere.
--
-- WHY A LEDGER RATHER THAN DERIVING IT
-- The usage could be recomputed on demand by joining order_items to recipes.
-- That works, needs no table, and covers orders placed before today — and it
-- is wrong in a way that only shows up later: it reads TODAY'S recipes. Change
-- how much cheese goes on a Large next month and last month's reported usage
-- changes with it, silently. It also cannot see stock that left for any reason
-- other than an order.
--
-- A ledger records what actually happened, when it happened, and is immune to
-- every later edit. Its usual drawback is that it only knows about movements
-- from the day it ships — and the database was reset to zero the day before
-- this was written, so there is no history to lose. This is the cheapest
-- moment this decision will ever be.
--
-- SIGNED, NOT TWO COLUMNS
-- quantity_delta is negative when stock leaves and positive when it arrives, so
-- the net position is a plain sum() and a cancelled order cancels itself out
-- arithmetically rather than by a rule somebody has to remember.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- THE TABLE
-- ---------------------------------------------------------------------------

create table if not exists public.stock_movements (
  id             uuid primary key default gen_random_uuid(),
  ingredient_id  uuid          not null references public.ingredients(id) on delete cascade,
  -- Negative = left the shelf, positive = arrived. numeric(12,3) to match
  -- ingredients.stock_quantity exactly; a narrower type here would round the
  -- ledger away from the running total it is meant to explain.
  quantity_delta numeric(12,3) not null check (quantity_delta <> 0),
  reason         text          not null check (reason in ('order', 'cancel', 'receive')),
  -- Null for a delivery, which belongs to no order. ON DELETE CASCADE rather
  -- than SET NULL: deleting an order is not something the shop does in normal
  -- running — only the go-live reset does it — and a usage figure that outlived
  -- the order explaining it would be a number nobody could account for.
  order_id       uuid          references public.orders(id) on delete cascade,
  created_at     timestamptz   not null default now()
);

comment on table public.stock_movements is
  'Every movement of stock, signed. The only record of what was used, as '
  'opposed to what is left. Written inside the same transaction as the '
  'movement itself, so a deduction cannot commit without its receipt.';

-- The two questions ever asked of this table: everything for one ingredient,
-- and everything since a moment.
create index if not exists stock_movements_ingredient_idx
  on public.stock_movements (ingredient_id, created_at desc);
create index if not exists stock_movements_created_at_idx
  on public.stock_movements (created_at desc);

-- Same posture as ingredients, recipes and stock_alerts: no grant and no
-- policy, for any client role. Postgres refuses at the privilege layer before
-- RLS is consulted. Staff read it through the function at the bottom.
alter table public.stock_movements enable row level security;
revoke all on public.stock_movements from anon, authenticated;


-- ---------------------------------------------------------------------------
-- WRITING ONE
--
-- A helper rather than three inline INSERTs, so the shape of a movement is
-- decided in one place. SECURITY DEFINER and revoked from everyone: the three
-- callers below are themselves SECURITY DEFINER and run as the owner, so they
-- need no grant, and nobody else has any business inventing stock history.
-- ---------------------------------------------------------------------------

create or replace function public.record_movement(
  p_ingredient_id uuid,
  p_delta         numeric,
  p_reason        text,
  p_order_id      uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A movement of nothing is not a movement. The check constraint would reject
  -- it anyway; returning quietly means a caller with an empty line does not
  -- have to special-case it.
  if p_delta is null or p_delta = 0 then
    return;
  end if;

  insert into public.stock_movements (ingredient_id, quantity_delta, reason, order_id)
  values (p_ingredient_id, p_delta, p_reason, p_order_id);
end;
$$;

revoke execute on function public.record_movement(uuid, numeric, text, uuid) from public;


-- ---------------------------------------------------------------------------
-- THE THREE FUNCTIONS THAT MOVE STOCK
--
-- Reproduced from deduct_stock.sql and receive_stock.sql with exactly one line
-- added to each: the record_movement() call, placed beside the existing
-- note_stock_level() call so the ledger entry is written under the same row
-- lock, in the same transaction, as the movement it describes. If the order
-- rolls back, so does its receipt.
--
-- Everything else below is unchanged. tests/stock-deduction.test.js,
-- tests/concurrency.test.js and tests/receive-stock.test.js all still run
-- against these, which is what proves the bodies did not drift.
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

    -- The ledger. Same place, same lock, same transaction as the movement
    -- it records, so a deduction cannot commit without its receipt.
    perform public.record_movement(v_need.ingredient_id, -v_need.required, 'order', p_order_id);
  end loop;

  -- Only now, once every ingredient is actually out. If the loop above raised,
  -- this never runs and the transaction unwinds anyway — but the flag says what
  -- happened rather than what was attempted.
  update public.orders set stock_deducted = true where id = p_order_id;
end;
$$;

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

    -- Positive: the shelf gained it back. Netted against the 'order' row
    -- above, a cancelled order shows as having used nothing.
    perform public.record_movement(v_need.ingredient_id, v_need.required, 'cancel', p_order_id);
  end loop;

  update public.orders set stock_deducted = false where id = p_order_id;
end;
$$;

create or replace function public.receive_stock(
  p_ingredient_id uuid,
  p_quantity      numeric
)
returns table (
  id                  uuid,
  name                text,
  unit                text,
  stock_quantity      numeric,
  low_stock_threshold numeric,
  is_low              boolean,
  is_out              boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  -- A single delivery larger than this is a typo, not a delivery. Mirrored by
  -- MAX_STOCK_RECEIPT in src/config/inventory.js, which tests/receive-stock
  -- pins to this value by probing the real database at the boundary.
  c_max_receipt constant numeric := 1000000;
  v_before numeric;
  v_after  numeric;
begin
  -- FR-7.6 lives on this line. is_admin() is deliberately NOT accepted.
  if not public.is_manager() then
    raise exception 'not_manager';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'invalid_quantity';
  end if;

  if p_quantity > c_max_receipt then
    raise exception 'quantity_too_large';
  end if;

  update public.ingredients i
     set stock_quantity = i.stock_quantity + p_quantity
   where i.id = p_ingredient_id
  returning i.stock_quantity - p_quantity, i.stock_quantity
       into v_before, v_after;

  if not found then
    raise exception 'ingredient_not_found';
  end if;

  -- Resolves any open low-stock alert if this delivery took the level back
  -- above the threshold. Part 3 already handles both directions; skipping this
  -- would leave a resolved shortage sitting on the Manager's screen for ever.
  --
  -- The sold-out flag needs no call: trg_ingredients_sold_out fires on any
  -- change to stock_quantity and un-flags the menu items automatically.
  perform public.note_stock_level(p_ingredient_id, v_before, v_after);

  -- A delivery in, not food out. Excluded from every usage figure.
  perform public.record_movement(p_ingredient_id, p_quantity, 'receive', null);

  return query
    select i.id,
           i.name,
           i.unit,
           i.stock_quantity,
           i.low_stock_threshold,
           (i.stock_quantity < i.low_stock_threshold) as is_low,
           (i.stock_quantity = 0)                     as is_out
      from public.ingredients i
     where i.id = p_ingredient_id;
end $$;

-- ---------------------------------------------------------------------------
-- WHAT WAS USED
--
-- FR-6.4 asks the Manager to cross-check stock against sales; this is the
-- other half of that. Both roles may read it: it names ingredients and
-- quantities, never a customer.
--
-- "USED" NETS OFF A CANCELLATION
-- A cancelled order returns everything it took, so its two rows sum to zero and
-- it counts as having used nothing — which is true, since an order can only be
-- cancelled before the kitchen starts. That also matches sales_report(), which
-- excludes cancelled orders from revenue, so the two screens agree about what
-- a day contained.
--
-- Deliveries are excluded outright. Receiving 20kg of dough is not using it.
--
-- THE DAY IS THE SHOP'S, NOT THE READER'S
-- Cut in Asia/Karachi, the same zone sales_report() buckets by. Grouping a
-- Pakistani shop's day in UTC would push every order after 5am local into
-- yesterday, and the usage and sales screens would disagree about what "today"
-- meant.
-- ---------------------------------------------------------------------------

create or replace function public.staff_ingredient_usage()
returns table (
  ingredient_id       uuid,
  name                text,
  unit                text,
  used_today          numeric,
  used_total          numeric,
  stock_quantity      numeric,
  low_stock_threshold numeric,
  is_low              boolean,
  is_out              boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  -- The shop is single-location (PRD section 8), so its time zone is a fact
  -- about the business rather than a setting. Same constant as sales_report().
  c_shop_tz constant text := 'Asia/Karachi';
begin
  if not (public.is_manager() or public.is_admin()) then
    raise exception 'not_staff';
  end if;

  return query
    select i.id,
           i.name,
           i.unit,
           -- Negated: deltas are negative when stock leaves, and a Manager
           -- asking "how much did we use" wants a positive number back.
           coalesce(-sum(m.quantity_delta) filter (
             where m.reason <> 'receive'
               and (m.created_at at time zone c_shop_tz)::date
                 = (now()          at time zone c_shop_tz)::date
           ), 0)::numeric,
           coalesce(-sum(m.quantity_delta) filter (where m.reason <> 'receive'), 0)::numeric,
           i.stock_quantity,
           i.low_stock_threshold,
           -- Same boundary as staff_ingredients(): low is below, not at.
           (i.stock_quantity < i.low_stock_threshold),
           (i.stock_quantity = 0)
      from public.ingredients i
      -- LEFT JOIN, so an ingredient nothing has touched still appears, at zero.
      -- An inner join would quietly drop every ingredient the shop has not used
      -- yet, which is exactly the list someone is checking.
      left join public.stock_movements m on m.ingredient_id = i.id
     group by i.id, i.name, i.unit, i.stock_quantity, i.low_stock_threshold
     -- Busiest first: the ingredient moving fastest is the one worth knowing
     -- about. Ties fall back to the name so the order is stable between reads.
     order by 4 desc, 5 desc, i.name;
end $$;

comment on function public.staff_ingredient_usage() is
  'What each ingredient has consumed today and in total (Manager and Admin). '
  'Cancelled orders net to zero; deliveries are excluded. Days are cut in the '
  'shop time zone, matching sales_report().';

revoke execute on function public.staff_ingredient_usage() from public;
grant execute on function public.staff_ingredient_usage() to authenticated;


-- ---------------------------------------------------------------------------
-- VERIFICATION
-- ---------------------------------------------------------------------------

do $$
declare
  v_fail int := 0;
  v_cols int;
  v_rows bigint;
  v_ings bigint;
  v_sig  text;
begin
  -- 1. the table exists with the columns the reader expects
  select count(*) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'stock_movements'
     and column_name in ('ingredient_id','quantity_delta','reason','order_id','created_at');
  if v_cols <> 5 then
    raise warning 'FAILED: stock_movements has % of 5 expected columns', v_cols;
    v_fail := v_fail + 1;
  end if;

  -- 2. it is closed to every client role, at the privilege layer
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'stock_movements'
       and grantee in ('anon','authenticated')
  ) then
    raise warning 'FAILED: stock_movements is reachable by a client role';
    v_fail := v_fail + 1;
  end if;

  -- 3. all three writers now carry a ledger call
  --
  -- Full signatures, not bare names: ::regproc throws on an overloaded name,
  -- and a database that has been through a few migrations is exactly where a
  -- stray overload would be sitting.
  for v_sig in
    select unnest(array[
      'public.deduct_order_stock(uuid)',
      'public.restore_order_stock(uuid)',
      'public.receive_stock(uuid, numeric)'
    ])
  loop
    if to_regprocedure(v_sig) is null then
      raise warning 'FAILED: % does not exist', v_sig;
      v_fail := v_fail + 1;
    elsif position('record_movement' in pg_get_functiondef(to_regprocedure(v_sig))) = 0 then
      raise warning 'FAILED: % has no record_movement() call', v_sig;
      v_fail := v_fail + 1;
    end if;
  end loop;

  -- 4. the reader exists, and is closed to anon
  --
  -- NOT by calling it. staff_ingredient_usage() begins with a Manager/Admin
  -- check, and the SQL Editor runs as `postgres` with auth.uid() null — so
  -- calling it here raises not_staff and rolls this whole file back. The first
  -- version of this block did exactly that. A role-gated function is verified
  -- by its definition and its grants; tests/ingredient-usage.test.js is what
  -- calls it, signed in as staff, which is the only way it can be called.
  if to_regprocedure('public.staff_ingredient_usage()') is null then
    raise warning 'FAILED: staff_ingredient_usage() does not exist';
    v_fail := v_fail + 1;
  end if;

  if has_function_privilege('anon', 'public.staff_ingredient_usage()', 'execute') then
    raise warning 'FAILED: anon can execute staff_ingredient_usage()';
    v_fail := v_fail + 1;
  end if;

  -- 5. where things stand, read from the tables rather than through the gate
  select count(*) into v_ings from public.ingredients;
  raise notice 'ingredients: %', v_ings;

  select count(*) into v_rows from public.stock_movements;
  raise notice 'movements recorded so far: %', v_rows;

  if v_fail = 0 then
    raise notice '--- LEDGER READY. Usage is recorded from this moment on. ---';
  else
    raise exception '--- % CHECK(S) FAILED ---', v_fail;
  end if;
end $$;
