-- Forno Pizza — marking a menu item unavailable when the kitchen cannot make it.
--
-- RUN ORDER: after seed_recipes.sql and recipes.sql. Then re-run place_order.sql,
-- which learns to refuse an item this file has flagged. Safe to re-run.
--
-- TWO FLAGS, NOT ONE
--
-- menu_items already had is_sold_out. It is NOT reused here, and that is the
-- main decision in this file.
--
--   is_sold_out   a person's decision. "We are not making this today." Set by
--                 hand, and in Part 4 by the Admin. Nothing automatic may
--                 touch it.
--   out_of_stock  the engine's observation. "An ingredient this needs is at
--                 zero." Recomputed from stock, never set by hand.
--
-- Folding them into one column would mean a restock silently un-hiding
-- something the Admin had deliberately pulled — the oven is broken, the dish is
-- off, and then a delivery of mozzarella puts it back on the menu. Keeping them
-- apart means the engine and the shop can each say their piece, and the
-- customer simply cannot order it while either one is true.

alter table public.menu_items
  add column if not exists out_of_stock boolean not null default false;

-- ---------------------------------------------------------------------------
-- RECOMPUTING IT
--
-- Called with an ingredient id after that ingredient crosses zero, or with no
-- argument to rebuild the lot — which is what Part 4 should do after editing a
-- recipe, since changing what a dish is made of can change whether it can be
-- made.
--
-- "At zero" rather than "not enough for this order" on purpose. Sold out is a
-- property of the dish on the menu, the same for everyone looking at it;
-- whether there is enough for one particular basket is a question only
-- place_order() can answer, and it already does, under a lock.
-- ---------------------------------------------------------------------------

create or replace function public.refresh_sold_out(p_ingredient_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.menu_items mi
     set out_of_stock = exists (
           select 1
           from public.menu_item_sizes ms
           join public.recipes     r on r.menu_item_size_id = ms.id
           join public.ingredients i on i.id = r.ingredient_id
           where ms.menu_item_id = mi.id
             and i.stock_quantity <= 0
         )
   where p_ingredient_id is null
      or exists (
           select 1
           from public.menu_item_sizes ms
           join public.recipes r on r.menu_item_size_id = ms.id
           where ms.menu_item_id = mi.id
             and r.ingredient_id = p_ingredient_id
         );
end;
$$;

-- ---------------------------------------------------------------------------
-- WATCHING THE SHELF
--
-- Fires on the crossing of zero, in either direction, for the same reason the
-- low-stock alert does: every order after the first one changes nothing about
-- whether the dish can be made, so recomputing on each of them is work with no
-- answer attached.
--
-- A trigger rather than a call inside deduct_order_stock(), because stock moves
-- for reasons other than orders. Part 4's Manager typing in a delivery has to
-- bring the menu back on its own, without anybody remembering to ask.
-- ---------------------------------------------------------------------------

create or replace function public.ingredient_crossed_zero()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.stock_quantity > 0) is distinct from (new.stock_quantity > 0) then
    perform public.refresh_sold_out(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_ingredients_sold_out on public.ingredients;
create trigger trg_ingredients_sold_out
  after update of stock_quantity on public.ingredients
  for each row execute function public.ingredient_crossed_zero();

-- ---------------------------------------------------------------------------
-- ACCESS
--
-- Both are SECURITY DEFINER over menu_items, which customers may read but never
-- write. Left callable, a visitor could mark the whole menu unavailable.
-- ---------------------------------------------------------------------------

revoke execute on function public.refresh_sold_out(uuid)   from public;
revoke execute on function public.ingredient_crossed_zero() from public;

-- Set the column to the truth as it stands right now, rather than waiting for
-- the next time something happens to move.
select public.refresh_sold_out();

select
  mi.name,
  mi.is_sold_out  as pulled_by_hand,
  mi.out_of_stock as no_ingredients,
  case when mi.is_sold_out or mi.out_of_stock then 'UNAVAILABLE' else '' end as shown_as
from public.menu_items mi
order by (mi.is_sold_out or mi.out_of_stock) desc, mi.sort_order;
