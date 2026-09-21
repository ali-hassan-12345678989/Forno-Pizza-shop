-- ---------------------------------------------------------------------------
-- Part 4, task 3: letting staff see stock levels.
--
-- FR-6.3  Manager can view current stock levels for all ingredients
-- FR-7.5  Admin can view current inventory levels (read-only)
--
-- Both requirements are the same READ, so it is written once here. What
-- separates the two roles is WRITING, which lands in the next task and is
-- Manager-only (FR-7.6). Splitting the read in two just to match the task list
-- would leave two copies to drift apart.
--
-- WHY A FUNCTION AND NOT A POLICY
-- schema.sql seals public.ingredients at both layers - no GRANT and no policy -
-- and Part 3 deliberately moved reviews off policies onto SECURITY DEFINER
-- functions for the same reason. Granting SELECT on the table to
-- `authenticated` would open the privilege layer for every customer and leave
-- RLS as the only thing standing between them and the shop's cost base. A
-- function keeps the table sealed and states the rule in one readable place.
-- ---------------------------------------------------------------------------

create or replace function public.staff_ingredients()
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
stable
as $$
begin
  if not (public.is_manager() or public.is_admin()) then
    raise exception 'not_staff';
  end if;

  return query
    select i.id,
           i.name,
           i.unit,
           i.stock_quantity,
           i.low_stock_threshold,
           -- Must agree with note_stock_level() in deduct_stock.sql, which
           -- fires an alert when stock crosses BELOW the threshold. If these
           -- two ever disagree the panel would show green while an alert sat
           -- in stock_alerts. tests/staff-inventory.test.js pins them together.
           (i.stock_quantity < i.low_stock_threshold) as is_low,
           (i.stock_quantity = 0)                     as is_out
      from public.ingredients i
     -- Most urgent first: empty, then running low, then the rest by name. A
     -- Manager opening this wants the problems, not the alphabet.
     order by (i.stock_quantity = 0) desc,
              (i.stock_quantity < i.low_stock_threshold) desc,
              i.name;
end $$;

comment on function public.staff_ingredients() is
  'Stock levels for Manager and Admin (FR-6.3, FR-7.5). Read-only. Refuses '
  'anyone without a staff role, so the ingredients table itself stays sealed.';

revoke execute on function public.staff_ingredients() from public;
grant execute on function public.staff_ingredients() to authenticated;
