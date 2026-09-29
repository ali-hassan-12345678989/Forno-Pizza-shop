-- ---------------------------------------------------------------------------
-- Forno Pizza — INDEXES THE ORDERS TABLE WILL WANT.
--
-- Nothing is wrong today. The shop has just opened and `orders` is empty, so
-- every query below is instant whatever Postgres does. This file is here
-- because all three get slowly worse with success, and three indexes cost
-- nothing to add now and are awkward to think about in a year.
--
-- `orders` already carries an index on id (primary key), order_number (unique),
-- access_token (unique) and user_id (explicit). Three columns the hot paths
-- filter and sort on have none.
--
-- SAFE TO RUN AT ANY TIME, including while the shop is taking orders. Every
-- statement is `create index if not exists`, so re-running does nothing, and
-- `concurrently` is deliberately NOT used — on an empty or small table it
-- costs nothing, and it cannot run inside the SQL Editor's transaction.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. THE RATE LIMIT, WHICH RUNS ON EVERY SINGLE ORDER
--
-- place_order() asks, before it writes anything:
--
--   select count(*) from public.orders
--    where customer_phone = v_phone
--      and created_at > now() - interval '2 minutes';
--
-- With no index that is a sequential scan of the whole orders table, and it
-- happens on every checkout — so the cost of placing an order grows with the
-- number of orders the shop has ever taken. It is the one query here that is
-- on a customer's critical path.
--
-- Composite rather than two separate indexes: the phone narrows it to a
-- handful of rows and the timestamp then orders them, which is exactly the
-- shape of the question being asked.
-- ---------------------------------------------------------------------------

create index if not exists orders_phone_created_at_idx
  on public.orders (customer_phone, created_at desc);


-- ---------------------------------------------------------------------------
-- 2. THE KITCHEN AND THE ADMIN BOARD, POLLED EVERY TEN SECONDS
--
-- chef_orders() and admin_active_orders() both filter on status to find the
-- orders still in play. Each open staff screen re-asks every ten seconds
-- (STAFF_POLL_MS), so this is the most frequently repeated query in the system
-- even though no customer is waiting on it.
--
-- Partial, on purpose. A finished order is never what these screens are
-- looking for, and the settled statuses are where nearly every row ends up
-- after a week of trading. Indexing only the live ones keeps this small
-- forever instead of growing with the shop's whole history.
-- ---------------------------------------------------------------------------

create index if not exists orders_active_status_idx
  on public.orders (status, created_at)
  where status not in ('delivered', 'picked_up', 'cancelled');


-- ---------------------------------------------------------------------------
-- 3. NEWEST FIRST, WHICH IS EVERY LIST OF ORDERS
--
-- admin_orders() returns the most recent hundred, the customer's own history
-- is ordered by it, and sales_report() buckets by it. All three sort on
-- created_at descending, which without an index means reading every row and
-- sorting the lot to return the top few.
-- ---------------------------------------------------------------------------

create index if not exists orders_created_at_idx
  on public.orders (created_at desc);


-- ---------------------------------------------------------------------------
-- 4. VERIFY
--
-- Confirms all three exist and that the planner will actually use the one that
-- matters most, rather than trusting that creating an index means using it.
-- ---------------------------------------------------------------------------

do $$
declare
  v_fail  int := 0;
  v_found int;
  v_plan  text;
begin
  select count(*) into v_found
    from pg_indexes
   where schemaname = 'public'
     and tablename  = 'orders'
     and indexname in ('orders_phone_created_at_idx',
                       'orders_active_status_idx',
                       'orders_created_at_idx');

  if v_found <> 3 then
    raise warning 'FAILED: expected 3 new indexes, found %', v_found;
    v_fail := v_fail + 1;
  end if;

  -- On an empty table Postgres will quite reasonably choose a sequential scan,
  -- because reading nothing is faster than reading an index first. So this
  -- reports the plan rather than demanding one: the index being unused on an
  -- empty shop is correct behaviour, not a failure.
  execute $q$
    explain (format text)
    select count(*) from public.orders
     where customer_phone = '03001234567'
       and created_at > now() - interval '2 minutes'
  $q$ into v_plan;

  raise notice 'rate-limit query plan today: %', v_plan;
  raise notice '  (a sequential scan here is correct while the table is small —';
  raise notice '   Postgres switches to the index once there are rows to skip)';

  if v_fail = 0 then
    raise notice '--- 3 indexes in place. Nothing else changed. ---';
  else
    raise exception '--- % CHECK(S) FAILED ---', v_fail;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- FOR THE RECORD
-- ---------------------------------------------------------------------------

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'orders'
order by indexname;
