-- ---------------------------------------------------------------------------
-- Part 4, task 5: the low-stock alerts finally get somewhere to be seen.
--
-- FR-5.4  crossing the low-stock threshold triggers an alert visible to
--         Manager and/or Admin
-- Part 4 "Done when": a low-stock alert is actually visible ON SCREEN, not
--         just sitting in the database
--
-- Part 3 has been writing these rows since deduct_stock.sql went in. Nothing
-- has ever read them. This is only the reader - the alert lifecycle itself
-- (raised on the way down, resolved on the way up) already exists in
-- note_stock_level() and is deliberately not duplicated here.
-- ---------------------------------------------------------------------------

create or replace function public.staff_stock_alerts()
returns table (
  id                  uuid,
  ingredient_id       uuid,
  ingredient_name     text,
  unit                text,
  stock_at_trigger    numeric,
  current_stock       numeric,
  low_stock_threshold numeric,
  triggered_at        timestamptz,
  still_below         boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not (public.is_manager() or public.is_admin()) then
    raise exception 'not_staff';
  end if;

  return query
    select a.id,
           i.id,
           i.name,
           i.unit,
           a.stock_at_trigger,
           i.stock_quantity,
           i.low_stock_threshold,
           a.triggered_at,
           -- An open alert should always still be below its threshold: crossing
           -- back up resolves it. If this is ever false, note_stock_level()
           -- missed a crossing, and the Manager is looking at a stale warning.
           -- verify_staff_alerts.sql asserts it never happens.
           (i.stock_quantity < i.low_stock_threshold) as still_below
      from public.stock_alerts a
      join public.ingredients i on i.id = a.ingredient_id
     -- Only what is still true. Resolved rows stay in the table as history,
     -- but a resolved shortage is not something to put in front of anyone.
     where a.resolved_at is null
     order by (i.stock_quantity = 0) desc,
              a.triggered_at desc;
end $$;

comment on function public.staff_stock_alerts() is
  'Open low-stock alerts for Manager and Admin (FR-5.4). Read-only. Resolved '
  'alerts are excluded - note_stock_level() closes them when stock recovers.';

revoke execute on function public.staff_stock_alerts() from public;
grant execute on function public.staff_stock_alerts() to authenticated;
