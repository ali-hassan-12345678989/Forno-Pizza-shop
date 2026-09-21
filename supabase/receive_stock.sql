-- ---------------------------------------------------------------------------
-- Part 4, task 4: the Manager books in stock that has arrived.
--
-- FR-6.2  Manager can add newly received stock for any ingredient
-- FR-7.6  Admin cannot add or modify stock quantities - Manager only
--
-- ADD, NEVER SET
-- The Manager says "+10kg chicken", not "chicken is now 40kg". A SET would be
-- a read-modify-write across a network: read 30, a customer's order deducts 2,
-- write 40, and the sale has silently been un-deducted. The addition happens
-- inside the UPDATE, so Postgres applies it to whatever the row holds at the
-- moment it takes the lock. Two deliveries booked at once both land.
--
-- This is the same reasoning as the concurrency work in Part 3, from the other
-- direction: never compute a new stock figure in the client.
-- ---------------------------------------------------------------------------

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

comment on function public.receive_stock(uuid, numeric) is
  'Books in newly received stock (FR-6.2). Manager only - the Admin is refused '
  'here, which is FR-7.6. Adds rather than sets, so concurrent writes cannot '
  'lose each other.';

revoke execute on function public.receive_stock(uuid, numeric) from public;
grant execute on function public.receive_stock(uuid, numeric) to authenticated;
