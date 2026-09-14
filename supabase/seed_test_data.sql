-- Forno Pizza — Part 1 test data.
-- Run AFTER schema.sql. Fixed UUIDs so the verification script can reference
-- these rows directly. Safe to re-run.
--
-- These inserts have to run here rather than from the app because menu_items,
-- ingredients and recipes are Admin-only — anon has no INSERT policy on them.

insert into public.menu_items (id, name, description, image_url, is_active, is_sold_out)
values (
  '11111111-1111-1111-1111-111111111111',
  'Classic pepperoni',
  'San Marzano tomato, mozzarella, cup-and-char pepperoni',
  'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee',
  true,
  false
)
on conflict (id) do nothing;

insert into public.menu_item_sizes (id, menu_item_id, size, price, sort_order)
values
  ('22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111', 'Medium', 14.00, 1),
  ('22222222-2222-2222-2222-333333333333',
   '11111111-1111-1111-1111-111111111111', 'Large',  19.00, 2)
on conflict (id) do nothing;

insert into public.ingredients (id, name, unit, stock_quantity, low_stock_threshold)
values (
  '33333333-3333-3333-3333-333333333333',
  'Mozzarella', 'g', 5000.000, 1000.000
)
on conflict (id) do nothing;

-- 150g of mozzarella per Medium pepperoni.
insert into public.recipes (id, menu_item_size_id, ingredient_id, quantity)
values (
  '44444444-4444-4444-4444-444444444444',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  150.000
)
on conflict (id) do nothing;
