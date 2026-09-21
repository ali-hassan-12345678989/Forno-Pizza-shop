-- ---------------------------------------------------------------------------
-- Part 4, task 6: sales reports.
--
-- FR-6.4  Manager can view sales reports (orders and revenue) to cross-check
--         against inventory usage
-- FR-7.4  Admin can view sales reports: daily, monthly and yearly
--
-- One function, three groupings. The Manager and the Admin want the same
-- numbers for different reasons, and two functions would be two places for the
-- definition of "a sale" to drift.
--
-- WHAT COUNTS AS A SALE
-- Every order except a cancelled one. Not just delivered ones: stock is
-- deducted the moment an order is placed and handed back only if it is
-- cancelled, so "not cancelled" is exactly the set of orders that consumed
-- ingredients. That is what makes FR-6.4's cross-check against inventory
-- usage actually work - counting only delivered orders would show less
-- revenue than the stock movement it is meant to explain.
--
-- TIME ZONE
-- Buckets are cut in Islamabad local time. Grouping a Pakistani shop's day in
-- UTC would push every order placed after 7pm into tomorrow.
-- ---------------------------------------------------------------------------

create or replace function public.sales_report(p_period text, p_limit int default 30)
returns table (
  period_start    date,
  order_count     bigint,
  revenue         numeric,
  goods_revenue   numeric,
  cancelled_count bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  -- The shop is single-location (PRD section 8), so its time zone is a fact
  -- about the business, not a setting anyone needs to change.
  c_shop_tz   constant text := 'Asia/Karachi';
  -- Mirrored by MAX_REPORT_PERIODS in src/config/reports.js.
  c_max_limit constant int  := 366;
begin
  if not (public.is_manager() or public.is_admin()) then
    raise exception 'not_staff';
  end if;

  -- Interpolated into date_trunc below, so it is checked against a fixed list
  -- rather than trusted. Anything else is rejected before it reaches SQL.
  if p_period is null or p_period not in ('day', 'month', 'year') then
    raise exception 'invalid_period';
  end if;

  if p_limit is null or p_limit <= 0 or p_limit > c_max_limit then
    raise exception 'invalid_limit';
  end if;

  return query
    select date_trunc(p_period, o.created_at at time zone c_shop_tz)::date as period_start,
           count(*) filter (where o.status <> 'cancelled')::bigint,
           coalesce(sum(o.total)    filter (where o.status <> 'cancelled'), 0)::numeric,
           -- Goods only. Delivery fees consume no ingredients, so leaving them
           -- in would make the inventory cross-check look short every time.
           coalesce(sum(o.subtotal) filter (where o.status <> 'cancelled'), 0)::numeric,
           count(*) filter (where o.status = 'cancelled')::bigint
      from public.orders o
     group by 1
     -- Newest first: a shop looks at yesterday far more often than last March.
     -- Periods with no orders at all are simply absent rather than zero-filled.
     order by 1 desc
     limit p_limit;
end $$;

comment on function public.sales_report(text, int) is
  'Orders and revenue grouped by day, month or year (FR-6.4, FR-7.4). Cancelled '
  'orders are counted separately and excluded from revenue, so the totals line '
  'up with the stock those orders actually consumed.';

revoke execute on function public.sales_report(text, int) from public;
grant execute on function public.sales_report(text, int) to authenticated;
