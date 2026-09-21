-- ---------------------------------------------------------------------------
-- Part 4, task 8: how busy the shop is right now.
--
-- FR-7.3  Admin can view the number of current/active orders
--
-- WHAT "ACTIVE" MEANS, WITHOUT SAYING IT TWICE
-- An order is active until it reaches the end of its ladder, or is cancelled.
-- The ladders already exist in order_status_flow() (Part 3), so the terminal
-- status is read off the end of the relevant array rather than listed again
-- here. Adding a fulfillment type later changes one function, not three.
-- ---------------------------------------------------------------------------

create or replace function public.order_is_active(p_status text, p_fulfillment_type text)
returns boolean
language sql
immutable
as $$
  -- 'cancelled' is the one terminal state that belongs to no ladder: an order
  -- can be cancelled from anywhere, so it cannot be derived from the flow.
  select p_status is distinct from 'cancelled'
     and p_status is distinct from (
       select f[array_length(f, 1)]
         from (select public.order_status_flow(p_fulfillment_type) as f) s
     );
$$;

comment on function public.order_is_active(text, text) is
  'True while an order is still in progress. Terminal status is read off the '
  'end of order_status_flow(), so the ladder is defined in exactly one place.';

create or replace function public.admin_active_orders()
returns table (
  status           text,
  fulfillment_type text,
  order_count      bigint,
  oldest_at        timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  -- Read-only and harmless, so both roles may see it. FR-7.3 names the Admin,
  -- and only the Admin panel shows it - but refusing the Manager a count of
  -- open orders would be a rule with nothing behind it.
  if not (public.is_manager() or public.is_admin()) then
    raise exception 'not_staff';
  end if;

  return query
    select o.status,
           o.fulfillment_type,
           count(*)::bigint,
           min(o.created_at)
      from public.orders o
     where public.order_is_active(o.status, o.fulfillment_type)
     group by o.status, o.fulfillment_type
     -- Oldest first: the order that has been waiting longest is the one that
     -- needs looking at.
     order by min(o.created_at);
end $$;

comment on function public.admin_active_orders() is
  'Open orders grouped by status and fulfillment type (FR-7.3), oldest first.';

revoke execute on function public.order_is_active(text, text) from public;
revoke execute on function public.admin_active_orders()       from public;

-- order_is_active() is used inside admin_active_orders(), which is SECURITY
-- DEFINER, so clients never need to call it themselves.
grant execute on function public.admin_active_orders() to authenticated;
