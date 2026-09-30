-- ---------------------------------------------------------------------------
-- Forno Pizza — WHAT THE MANAGER PANEL NEEDS THAT THE DATABASE COULD NOT ANSWER.
--
-- RUN ORDER: after schema.sql, stock_movements.sql, order_status.sql, chef.sql
-- and staff_roles.sql. Safe to re-run: every statement is idempotent.
-- This is the ONLY file to run for the Manager UI work.
--
-- The shop's owner reviewed the Manager panel and asked for twelve changes.
-- Nine were presentation and are pure front-end. Three needed the database to
-- know something it did not, and one of those turned out to be impossible as
-- stated. That last one is worth reading before the code.
--
-- "THEORETICAL VS ACTUAL USAGE" WAS ALWAYS GOING TO BE ZERO.
-- The request was to compare what the recipes say should have been used
-- against what actually left the shelf, so that heavy-handed portioning shows
-- up as a gap. In this system there is no gap to find. deduct_order_stock()
-- computes each requirement FROM the recipe and writes exactly that number to
-- the ledger:
--
--     perform public.record_movement(v_need.ingredient_id, -v_need.required, ...)
--
-- so "actual depletion" and "theoretical usage" are the same arithmetic run
-- once. A variance column built on those two figures would read 0.000 for
-- every ingredient, forever, and would keep reading zero while a cook put
-- double cheese on every pizza — the one thing it was meant to catch.
--
-- The missing number is a PHYSICAL COUNT: somebody looking at the shelf and
-- saying how much is really there. That is a fact the recipes cannot produce
-- and the only thing a book figure can honestly be checked against. So this
-- file adds counting, and variance falls out of it as a subtraction.
--
-- WHY CANCELLATION REASONS ARE THE CUSTOMER'S, NOT THE KITCHEN'S.
-- The owner asked to break cancellations down by "kitchen errors, delivery
-- failures, system test orders". Staff cannot cancel an order in this system at
-- all: set_order_status() moves an order along order_status_flow(), and
-- 'cancelled' is not on that ladder. The only cancellation path is
-- cancel_order(), which needs the customer's own access token and refuses once
-- the status leaves 'placed'. Every cancellation this shop will ever record is
-- therefore a customer changing their mind before the kitchen started, and the
-- useful question is why they did — which is what the vocabulary below asks.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. WHY AN ORDER WAS CANCELLED
--
-- Nullable, because every order cancelled before today has no answer and
-- inventing one would be worse than admitting it. The check constraint is the
-- vocabulary: a free-text box would produce thirty spellings of "changed my
-- mind" and nothing groupable, which is the entire point of the column.
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists cancelled_reason text;

alter table public.orders
  drop constraint if exists orders_cancelled_reason_check;

alter table public.orders
  add constraint orders_cancelled_reason_check check (
    cancelled_reason is null
    or cancelled_reason in ('changed_mind', 'ordered_by_mistake', 'wrong_details',
                            'too_slow', 'other')
  );

-- A reason on an order that was never cancelled is a contradiction, and one
-- that would quietly skew every breakdown built on this column.
alter table public.orders
  drop constraint if exists orders_reason_needs_cancellation;

alter table public.orders
  add constraint orders_reason_needs_cancellation check (
    cancelled_reason is null or status = 'cancelled'
  );

comment on column public.orders.cancelled_reason is
  'Why the customer cancelled, from a fixed vocabulary. Null for orders '
  'cancelled before this column existed, and for anyone who declined to say.';


-- ---------------------------------------------------------------------------
-- 2. CANCELLING, NOW WITH A REASON
--
-- The 1-argument version is dropped rather than left beside this one. Left in
-- place it would still match a 1-argument call exactly, so the old path would
-- keep winning and the column would stay empty while looking wired up.
--
-- The reason is OPTIONAL on purpose. A customer who wants out should never be
-- held there by a required question, and a cancellation that fails because
-- somebody skipped a radio button is a worse outcome than a null.
--
-- Everything else is unchanged from order_status.sql — same lock, same window,
-- same stock restoration, same return shape.
-- ---------------------------------------------------------------------------

drop function if exists public.cancel_order(uuid);

create or replace function public.cancel_order(
  p_access_token uuid,
  p_reason       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order  public.orders;
  v_reason text;
begin
  -- Normalised before the constraint sees it, so '' from an untouched form is
  -- stored as "declined to say" rather than rejected as an invalid word.
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  if v_reason is not null
     and v_reason not in ('changed_mind', 'ordered_by_mistake', 'wrong_details',
                          'too_slow', 'other') then
    raise exception 'invalid_reason';
  end if;

  select * into v_order
  from public.orders
  where access_token = p_access_token
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'already_cancelled';
  end if;

  if v_order.status <> 'placed' then
    raise exception 'cancel_window_closed';
  end if;

  update public.orders
     set status = 'cancelled',
         cancelled_reason = v_reason
   where id = v_order.id;

  perform public.restore_order_stock(v_order.id);

  return public.get_order_by_token(p_access_token);
end;
$$;

revoke execute on function public.cancel_order(uuid, text) from public;
grant execute on function public.cancel_order(uuid, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. A FOURTH KIND OF MOVEMENT
--
-- A physical count that disagrees with the books has to move stock, and every
-- movement of stock belongs in the ledger — that invariant is the only reason
-- the running total can be explained at all. So 'count' joins the vocabulary.
-- ---------------------------------------------------------------------------

alter table public.stock_movements
  drop constraint if exists stock_movements_reason_check;

alter table public.stock_movements
  add constraint stock_movements_reason_check
  check (reason in ('order', 'cancel', 'receive', 'count'));


-- ---------------------------------------------------------------------------
-- 4. THE COUNT ITSELF
--
-- Both numbers are kept, not just the difference. `expected_quantity` is what
-- the books said at the instant of counting, read under the same row lock that
-- writes the correction, so the pair is a photograph of one moment rather than
-- two readings taken seconds apart. Storing only the variance would leave a
-- number nobody could later audit.
-- ---------------------------------------------------------------------------

create table if not exists public.stock_counts (
  id                uuid primary key default gen_random_uuid(),
  ingredient_id     uuid          not null references public.ingredients(id) on delete cascade,
  -- What was actually on the shelf. Zero is a legitimate count — the shelf can
  -- genuinely be empty — so this is >= 0, unlike a delivery which must be > 0.
  counted_quantity  numeric(12,3) not null check (counted_quantity >= 0),
  -- What the books said at that instant.
  expected_quantity numeric(12,3) not null,
  -- Who to ask about it. SET NULL rather than CASCADE: a count is a fact about
  -- the shop's stock and outlives whoever happened to take it.
  counted_by        uuid          references auth.users(id) on delete set null,
  note              text          check (note is null or length(note) <= 200),
  counted_at        timestamptz   not null default now()
);

comment on table public.stock_counts is
  'Physical stock counts. The only figure in the system that does not come '
  'from a recipe, and therefore the only thing the book stock can be checked '
  'against.';

-- The two questions: one ingredient over time, and everything in a window.
create index if not exists stock_counts_ingredient_idx
  on public.stock_counts (ingredient_id, counted_at desc);
create index if not exists stock_counts_counted_at_idx
  on public.stock_counts (counted_at desc);

-- Same posture as ingredients, recipes and stock_movements: no grant, no
-- policy, for any client role. Postgres refuses at the privilege layer before
-- RLS is ever consulted. Staff read it through the functions below.
alter table public.stock_counts enable row level security;
revoke all on public.stock_counts from anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5. TAKING A COUNT
--
-- Locks the ingredient row, reads the book figure under that lock, writes the
-- count, corrects the running total, and files the difference in the ledger —
-- all in one transaction. Nothing can deduct an order between the read and the
-- correction, which is the whole reason this is a function and not three
-- statements from the browser.
--
-- Counting to the same number the books already hold is not an error. It is the
-- good outcome, and it is still recorded: "we checked and it was right" is
-- exactly as worth knowing as a discrepancy, and without it there is no way to
-- tell a shelf nobody has counted from one that counted clean.
-- ---------------------------------------------------------------------------

create or replace function public.record_stock_count(
  p_ingredient_id uuid,
  p_counted       numeric,
  p_note          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_count constant numeric := 1000000;
  v_expected  numeric;
  v_delta     numeric;
  v_note      text;
begin
  -- Stock is the Manager's job. The Admin is included for the same reason they
  -- can work the kitchen screen: they already see every one of these numbers,
  -- so refusing them the correction would be a rule with nothing behind it.
  if not (public.is_manager() or public.is_admin()) then
    raise exception 'not_staff';
  end if;

  if p_counted is null or p_counted < 0 or p_counted > c_max_count then
    raise exception 'invalid_count';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and length(v_note) > 200 then
    raise exception 'note_too_long';
  end if;

  -- The lock, and the book figure as it stands inside it.
  select stock_quantity into v_expected
  from public.ingredients
  where id = p_ingredient_id
  for update;

  if not found then
    raise exception 'ingredient_not_found';
  end if;

  insert into public.stock_counts
    (ingredient_id, counted_quantity, expected_quantity, counted_by, note)
  values
    (p_ingredient_id, p_counted, v_expected, auth.uid(), v_note);

  v_delta := p_counted - v_expected;

  -- A count that agrees with the books moves nothing, and record_movement()
  -- already returns quietly on a zero delta — but saying so here keeps the
  -- ledger free of rows that describe no movement.
  if v_delta <> 0 then
    update public.ingredients
       set stock_quantity = p_counted
     where id = p_ingredient_id;

    -- Still under the same lock, so the alert is raised against the level this
    -- correction actually produced.
    perform public.note_stock_level(p_ingredient_id, v_expected, p_counted);
    perform public.record_movement(p_ingredient_id, v_delta, 'count', null);
  end if;

  return jsonb_build_object(
    'ingredient_id', p_ingredient_id,
    'expected', v_expected,
    'counted', p_counted,
    'variance', v_delta
  );
end;
$$;

revoke execute on function public.record_stock_count(uuid, numeric, text) from public;
grant execute on function public.record_stock_count(uuid, numeric, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 6. USAGE, UNCHANGED IN MEANING AND NARROWER IN DEFINITION
--
-- Redefined from stock_movements.sql for exactly one reason: the filter used to
-- read `reason <> 'receive'`, which was a correct way to say "orders only"
-- while 'order', 'cancel' and 'receive' were the only three words. Now that
-- 'count' exists, that filter would quietly fold every stock correction into
-- "used", and a shelf found 2 kg short would be reported as 2 kg of cooking.
--
-- Naming the two reasons that ARE usage says what was always meant and cannot
-- be widened by accident when a fifth reason arrives.
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
  c_shop_tz constant text := 'Asia/Karachi';
begin
  if not (public.is_manager() or public.is_admin()) then
    raise exception 'not_staff';
  end if;

  return query
    select i.id,
           i.name,
           i.unit,
           coalesce(-sum(m.quantity_delta) filter (
             where m.reason in ('order', 'cancel')
               and (m.created_at at time zone c_shop_tz)::date
                 = (now()          at time zone c_shop_tz)::date
           ), 0)::numeric,
           coalesce(-sum(m.quantity_delta) filter (
             where m.reason in ('order', 'cancel')
           ), 0)::numeric,
           i.stock_quantity,
           i.low_stock_threshold,
           (i.stock_quantity < i.low_stock_threshold),
           (i.stock_quantity = 0)
      from public.ingredients i
      left join public.stock_movements m on m.ingredient_id = i.id
     group by i.id, i.name, i.unit, i.stock_quantity, i.low_stock_threshold
     order by 4 desc, 5 desc, i.name;
end $$;

revoke execute on function public.staff_ingredient_usage() from public;
grant execute on function public.staff_ingredient_usage() to authenticated;


-- ---------------------------------------------------------------------------
-- 7. USAGE OVER A CHOSEN WINDOW, WITH THE VARIANCE BESIDE IT
--
-- "All time" is the figure a stock ledger is worst at answering usefully: it
-- grows forever and can never be reconciled against anything, because there is
-- no physical count covering all of time. A window can be — count the shelf on
-- Monday, count it again the following Monday, and the week between them is a
-- closed set of books.
--
-- Dates, not timestamps, and cut in the shop's own zone. A Manager asking for
-- "last week" means seven of the shop's days, not 168 hours from whenever they
-- happened to click. p_to is INCLUSIVE for the same reason: nobody reconciling
-- Monday to Sunday expects Sunday to be missing.
--
-- WHAT VARIANCE MEANS HERE. Negative is stock that disappeared beyond what the
-- recipes explain — over-portioning, waste, breakage, theft. Positive means
-- more was found than the books expected, which is usually a delivery booked in
-- wrong rather than good news. Null means nobody counted, and null is shown as
-- "not counted" rather than as zero: a shelf nobody checked is not a shelf that
-- balanced.
-- ---------------------------------------------------------------------------

create or replace function public.staff_usage_between(
  p_from date,
  p_to   date
)
returns table (
  ingredient_id       uuid,
  name                text,
  unit                text,
  used                numeric,
  received            numeric,
  stock_quantity      numeric,
  low_stock_threshold numeric,
  is_low              boolean,
  is_out              boolean,
  variance            numeric,
  counts_taken        bigint,
  last_counted_at     timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  c_shop_tz   constant text := 'Asia/Karachi';
  c_max_days  constant int  := 366;
  v_from      timestamptz;
  v_to        timestamptz;
begin
  if not (public.is_manager() or public.is_admin()) then
    raise exception 'not_staff';
  end if;

  if p_from is null or p_to is null then
    raise exception 'invalid_range';
  end if;

  if p_to < p_from then
    raise exception 'invalid_range';
  end if;

  -- A year is already more than anyone reconciles in one go, and the bound is
  -- what stops a mistyped year turning into a scan of the whole ledger.
  if (p_to - p_from) > c_max_days then
    raise exception 'range_too_long';
  end if;

  -- Half-open in UTC, inclusive in shop days: everything from the first
  -- midnight up to, but not including, the midnight after the last day.
  v_from := (p_from::timestamp)             at time zone c_shop_tz;
  v_to   := ((p_to + 1)::timestamp)         at time zone c_shop_tz;

  return query
    with moved as (
      select m.ingredient_id,
             coalesce(-sum(m.quantity_delta) filter (
               where m.reason in ('order', 'cancel')), 0)::numeric as used,
             coalesce( sum(m.quantity_delta) filter (
               where m.reason = 'receive'), 0)::numeric            as received
        from public.stock_movements m
       where m.created_at >= v_from
         and m.created_at <  v_to
       group by m.ingredient_id
    ),
    counted as (
      select c.ingredient_id,
             sum(c.counted_quantity - c.expected_quantity)::numeric as variance,
             count(*)::bigint                                       as counts_taken,
             max(c.counted_at)                                      as last_counted_at
        from public.stock_counts c
       where c.counted_at >= v_from
         and c.counted_at <  v_to
       group by c.ingredient_id
    )
    select i.id,
           i.name,
           i.unit,
           coalesce(mv.used, 0)::numeric,
           coalesce(mv.received, 0)::numeric,
           i.stock_quantity,
           i.low_stock_threshold,
           (i.stock_quantity < i.low_stock_threshold),
           (i.stock_quantity = 0),
           -- Deliberately NOT coalesced to zero. See the header: uncounted and
           -- counted-clean are different answers.
           ct.variance,
           coalesce(ct.counts_taken, 0)::bigint,
           ct.last_counted_at
      from public.ingredients i
      left join moved   mv on mv.ingredient_id = i.id
      left join counted ct on ct.ingredient_id = i.id
     -- Busiest first, then anything with a discrepancy, then by name so the
     -- order is stable between reads.
     order by 4 desc, abs(coalesce(ct.variance, 0)) desc, i.name;
end $$;

comment on function public.staff_usage_between(date, date) is
  'Ingredient usage, deliveries and counted variance across a window of shop '
  'days, inclusive of both ends. Null variance means nobody counted.';

revoke execute on function public.staff_usage_between(date, date) from public;
grant execute on function public.staff_usage_between(date, date) to authenticated;


-- ---------------------------------------------------------------------------
-- 8. WHAT ACTUALLY SELLS
--
-- Grouped by the menu item rather than by size, because "Chicken Tikka" is the
-- thing a Manager thinks about and a Medium and a Large of it are the same
-- decision. item_name is the snapshot stored on the order line, so a pizza
-- renamed last month still reports under the name it was sold as.
-- ---------------------------------------------------------------------------

create or replace function public.staff_top_items(p_days int default 7)
returns table (
  menu_item_id uuid,
  item_name    text,
  qty_sold     bigint,
  revenue      numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  c_shop_tz  constant text := 'Asia/Karachi';
  c_max_days constant int  := 366;
  v_days     int;
begin
  if not (public.is_manager() or public.is_admin()) then
    raise exception 'not_staff';
  end if;

  v_days := coalesce(p_days, 7);
  if v_days < 1 or v_days > c_max_days then
    raise exception 'invalid_range';
  end if;

  return query
    select oi.menu_item_id,
           -- One name per item even if it was renamed mid-window: the most
           -- recent spelling wins, so the list does not show the same pizza
           -- twice under two names.
           (array_agg(oi.item_name order by oi.created_at desc))[1]::text,
           sum(oi.quantity)::bigint,
           sum(oi.line_total)::numeric
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     -- A cancelled order sold nothing. Its stock went back on the shelf, so
     -- counting it here would disagree with the usage screen beside it.
     where o.status <> 'cancelled'
       and (o.created_at at time zone c_shop_tz)::date
         > (now()        at time zone c_shop_tz)::date - v_days
     group by oi.menu_item_id
     order by 3 desc, 4 desc;
end $$;

revoke execute on function public.staff_top_items(int) from public;
grant execute on function public.staff_top_items(int) to authenticated;


-- ---------------------------------------------------------------------------
-- 9. THE CANCELLATIONS THEMSELVES
--
-- The summary strip says how many. This says which, so the number is something
-- to investigate rather than something to worry about. Deliberately returns the
-- orders and not a pre-grouped count: the grouping is three lines of JavaScript
-- over rows the Manager can also read individually, and a function that only
-- returned totals would leave "which ones?" unanswerable.
--
-- No customer_phone and no address. The Manager's job here is to understand a
-- pattern, and a name and an order number identify a cancellation perfectly
-- well without handing a second screen the shop's contact list.
-- ---------------------------------------------------------------------------

create or replace function public.staff_cancelled_orders(p_days int default 30)
returns table (
  order_number     text,
  customer_name    text,
  fulfillment_type text,
  total            numeric,
  cancelled_reason text,
  created_at       timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  c_shop_tz  constant text := 'Asia/Karachi';
  c_max_days constant int  := 366;
  c_max_rows constant int  := 200;
  v_days     int;
begin
  if not (public.is_manager() or public.is_admin()) then
    raise exception 'not_staff';
  end if;

  v_days := coalesce(p_days, 30);
  if v_days < 1 or v_days > c_max_days then
    raise exception 'invalid_range';
  end if;

  return query
    select o.order_number,
           o.customer_name,
           o.fulfillment_type,
           o.total,
           o.cancelled_reason,
           o.created_at
      from public.orders o
     where o.status = 'cancelled'
       and (o.created_at at time zone c_shop_tz)::date
         > (now()        at time zone c_shop_tz)::date - v_days
     order by o.created_at desc
     limit c_max_rows;
end $$;

revoke execute on function public.staff_cancelled_orders(int) from public;
grant execute on function public.staff_cancelled_orders(int) to authenticated;


-- ---------------------------------------------------------------------------
-- 10. WHEN THE SHOP IS BUSY
--
-- Five buckets covering the whole clock, because a report with a gap in it
-- invites the question "where did those orders go". The boundaries are defined
-- here and nowhere else: the function returns the label and its position, so
-- the browser sorts and prints without owning a second copy of the vocabulary
-- that could drift from this one.
--
-- Cut in the shop's own time zone, like every other time-based figure in this
-- database, so "Dinner" means dinner in Islamabad.
-- ---------------------------------------------------------------------------

create or replace function public.sales_by_daypart(p_days int default 30)
returns table (
  daypart     text,
  sort_order  int,
  starts_hour int,
  ends_hour   int,
  order_count bigint,
  revenue     numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  c_shop_tz  constant text := 'Asia/Karachi';
  c_max_days constant int  := 366;
  v_days     int;
begin
  if not (public.is_manager() or public.is_admin()) then
    raise exception 'not_staff';
  end if;

  v_days := coalesce(p_days, 30);
  if v_days < 1 or v_days > c_max_days then
    raise exception 'invalid_range';
  end if;

  return query
    with parts(daypart, sort_order, starts_hour, ends_hour) as (
      values ('Morning',    1,  5, 11),
             ('Lunch',      2, 11, 16),
             ('Afternoon',  3, 16, 19),
             ('Dinner',     4, 19, 23),
             ('Late night', 5, 23,  5)
    ),
    placed as (
      select extract(hour from (o.created_at at time zone c_shop_tz))::int as hr,
             o.total
        from public.orders o
       where o.status <> 'cancelled'
         and (o.created_at at time zone c_shop_tz)::date
           > (now()        at time zone c_shop_tz)::date - v_days
    )
    select p.daypart,
           p.sort_order,
           p.starts_hour,
           p.ends_hour,
           count(pl.hr)::bigint,
           coalesce(sum(pl.total), 0)::numeric
      from parts p
      -- LEFT JOIN so a day-part with no orders still appears, at zero. A
      -- missing row would read as "no data" when the answer is "nobody orders
      -- then", and those are different things to a Manager writing a rota.
      left join placed pl
        -- The last bucket wraps past midnight, so it is the union of two
        -- ranges rather than a single between.
        on case when p.starts_hour < p.ends_hour
                then pl.hr >= p.starts_hour and pl.hr < p.ends_hour
                else pl.hr >= p.starts_hour or  pl.hr < p.ends_hour
           end
     group by p.daypart, p.sort_order, p.starts_hour, p.ends_hour
     order by p.sort_order;
end $$;

revoke execute on function public.sales_by_daypart(int) from public;
grant execute on function public.sales_by_daypart(int) to authenticated;


-- ---------------------------------------------------------------------------
-- 11. VERIFY
--
-- Proves the things that would otherwise fail silently at 7pm on a Friday: that
-- every function exists with the signature the browser calls, that none of them
-- is reachable by a signed-out visitor, and that the two new constraints
-- actually reject what they are there to reject.
-- ---------------------------------------------------------------------------

do $$
declare
  v_fail int := 0;
  v_sig  text;
  v_ok   boolean;
begin
  -- Every new or changed entry point, at the exact signature the app calls.
  foreach v_sig in array array[
    'public.cancel_order(uuid, text)',
    'public.record_stock_count(uuid, numeric, text)',
    'public.staff_ingredient_usage()',
    'public.staff_usage_between(date, date)',
    'public.staff_top_items(int)',
    'public.staff_cancelled_orders(int)',
    'public.sales_by_daypart(int)'
  ] loop
    if to_regprocedure(v_sig) is null then
      raise warning 'FAILED: % does not exist', v_sig;
      v_fail := v_fail + 1;
    end if;
  end loop;

  -- The old 1-argument cancel must be GONE, not merely superseded. Left in
  -- place it would keep matching every existing 1-argument call, and the
  -- reason column would stay empty while looking wired up.
  if to_regprocedure('public.cancel_order(uuid)') is not null then
    raise warning 'FAILED: the old cancel_order(uuid) is still callable';
    v_fail := v_fail + 1;
  end if;

  -- Nothing here is a customer's business. cancel_order is the one exception,
  -- and it is checked separately below because a guest with a tracking link
  -- must be able to call it.
  foreach v_sig in array array[
    'public.record_stock_count(uuid, numeric, text)',
    'public.staff_usage_between(date, date)',
    'public.staff_top_items(int)',
    'public.staff_cancelled_orders(int)',
    'public.sales_by_daypart(int)'
  ] loop
    if to_regprocedure(v_sig) is not null
       and has_function_privilege('anon', v_sig, 'execute') then
      raise warning 'FAILED: anon can execute %', v_sig;
      v_fail := v_fail + 1;
    end if;
  end loop;

  if to_regprocedure('public.cancel_order(uuid, text)') is not null
     and not has_function_privilege('anon', 'public.cancel_order(uuid, text)', 'execute') then
    raise warning 'FAILED: a guest can no longer cancel their own order';
    v_fail := v_fail + 1;
  end if;

  -- The counts table must be unreachable directly, whatever RLS says.
  if has_table_privilege('anon', 'public.stock_counts', 'select')
     or has_table_privilege('authenticated', 'public.stock_counts', 'select') then
    raise warning 'FAILED: stock_counts is directly readable by a client role';
    v_fail := v_fail + 1;
  end if;

  -- The ledger must now accept 'count' and must still refuse a made-up word.
  begin
    v_ok := false;
    perform 1 from public.stock_movements where reason = 'count';
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  if not v_ok then
    raise warning 'FAILED: stock_movements does not accept the reason ''count''';
    v_fail := v_fail + 1;
  end if;

  if v_fail = 0 then
    raise notice '--- manager_insights.sql is in place. % checks passed. ---', 14;
  else
    raise exception '--- % CHECK(S) FAILED ---', v_fail;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- FOR THE RECORD
-- ---------------------------------------------------------------------------

select p.proname          as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('cancel_order', 'record_stock_count', 'staff_ingredient_usage',
                     'staff_usage_between', 'staff_top_items',
                     'staff_cancelled_orders', 'sales_by_daypart')
 order by 1, 2;
