-- Forno Pizza — full menu for Part 2.
-- Run in the Supabase SQL Editor AFTER schema.sql. Safe to re-run.
--
-- Flavours follow what Domino's PK, Pizza Hut PK and Cheezious actually sell
-- (Chicken Tikka, Fajita, Peri Peri, Behari Kabab, Malai Tikka…) rather than a
-- Western menu. Prices sit just under the chains: mid-range Medium runs
-- 1,100–1,300 at Cheezious/Pizza Hut, so Forno lands ~890–1,290.
--
-- seed_test_data.sql created one placeholder item priced in dollars carried
-- over from the design mock. This promotes that same row into Chicken Tikka
-- rather than duplicating it: Part 1's tests pin to its id, and the recipe/BOM
-- row already points at its Medium size.

-- category drives the filter chips; badge drives the coloured card tags.
-- "new / hot / vegetarian / best-seller" is Domino's PK's own badge vocabulary.
alter table public.menu_items add column if not exists category   text;
alter table public.menu_items add column if not exists badge      text;
alter table public.menu_items add column if not exists sort_order int not null default 0;

update public.menu_items
set name        = 'Chicken Tikka',
    description = 'Mozzarella, marinated tikka chunks, onion, capsicum',
    image_url   = 'https://images.unsplash.com/photo-1594007654729-407eedc4be65',
    category    = 'Classics',
    badge       = 'best-seller',
    sort_order  = 1,
    is_active   = true,
    is_sold_out = false
where id = '11111111-1111-1111-1111-111111111111';

update public.menu_item_sizes set price = 1050, sort_order = 1
where id = '22222222-2222-2222-2222-222222222222';
update public.menu_item_sizes set price = 1550, sort_order = 2
where id = '22222222-2222-2222-2222-333333333333';

-- Sizes are per item, so a burger can be "Regular/Double" while a pizza is
-- "Medium/Large" without either needing its own table.
insert into public.menu_items (id, name, description, image_url, category, badge, sort_order, is_active, is_sold_out)
values
  ('a1000000-0000-4000-8000-000000000002', 'Chicken Fajita',
   'Fajita-spiced chicken, green pepper, onion, mozzarella',
   'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38', 'Classics', null, 2, true, false),
  ('a1000000-0000-4000-8000-000000000003', 'Peri Peri',
   'Spicy chicken, onion, green pepper, peri peri sauce',
   'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3', 'Classics', 'hot', 3, true, false),
  ('a1000000-0000-4000-8000-000000000004', 'Chicken Supreme',
   'Chicken, mushroom, olives, capsicum, sweetcorn, mozzarella',
   'https://images.unsplash.com/photo-1552539618-7eec9b4d1796', 'Classics', null, 4, true, false),
  ('a1000000-0000-4000-8000-000000000005', 'Chicken Pepperoni',
   'Cup-and-char chicken pepperoni over San Marzano tomato',
   'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee', 'Classics', null, 5, true, false),
  ('a1000000-0000-4000-8000-000000000006', 'Margherita',
   'Fresh mozzarella, basil, olive oil, sea salt',
   'https://images.unsplash.com/photo-1595854341625-f33ee10dbf94', 'Classics', 'vegetarian', 6, true, false),
  ('a1000000-0000-4000-8000-000000000007', 'Behari Kabab',
   'Behari-marinated beef strips, onion, coriander, chilli',
   'https://images.unsplash.com/photo-1588315029754-2dd089d39a1a', 'Signature', 'hot', 7, true, false),
  ('a1000000-0000-4000-8000-000000000008', 'Malai Tikka',
   'Creamy malai chicken, white sauce, mozzarella, coriander',
   'https://images.unsplash.com/photo-1555072956-7758afb20e8f', 'Signature', 'new', 8, true, false),
  ('a1000000-0000-4000-8000-000000000009', 'Chicken Tandoori',
   'Tandoori chicken, red onion, capsicum, smoked chilli',
   'https://images.unsplash.com/photo-1579751626657-72bc17010498', 'Signature', null, 9, true, false),
  ('a1000000-0000-4000-8000-00000000000a', 'Hot n Spicy',
   'Chilli chicken, jalapeño, red onion, crushed red pepper',
   'https://images.unsplash.com/photo-1566843972142-a7fcb70de55a', 'Signature', 'hot', 10, true, false),
  ('a1000000-0000-4000-8000-00000000000b', 'Cheese Lover',
   'Mozzarella, cheddar, parmesan, cream cheese, thyme',
   'https://images.unsplash.com/photo-1593504049359-74330189a345', 'Signature', 'best-seller', 11, true, false),
  -- Seeded sold out in Part 2, when there was nothing to drive that flag and a
  -- hand-set one was the only way to see the disabled card on the menu. Part 3
  -- task 7 gives the job to the engine: out_of_stock now tracks real stock, and
  -- is_sold_out means only what a person deliberately decided. So this goes
  -- back to false — leaving it would be the shop permanently refusing to make a
  -- pizza it has every ingredient for.
  ('a1000000-0000-4000-8000-00000000000c', 'Chicken Mushroom',
   'Tikka chunks, sautéed mushroom, onion, garlic cream',
   'https://images.unsplash.com/photo-1571066811602-716837d681de', 'Signature', null, 12, true, false),
  ('a1000000-0000-4000-8000-00000000000d', 'Only Veggie',
   'Olives, mushroom, tomato, onion, green pepper, sweetcorn',
   'https://images.unsplash.com/photo-1590947132387-155cc02f3212', 'Signature', 'vegetarian', 13, true, false),
  ('a1000000-0000-4000-8000-00000000000e', 'Fiery Fillet Burger',
   'Spicy fried chicken fillet, lettuce, mayo, sesame bun',
   'https://images.unsplash.com/photo-1586190848861-99aa4a171e90', 'Burgers', 'hot', 14, true, false),
  ('a1000000-0000-4000-8000-00000000000f', 'Crunch Chicken Burger',
   'Crispy chicken fillet, signature spicy mayo, pickles',
   'https://images.unsplash.com/photo-1571091718767-18b5b1457add', 'Burgers', null, 15, true, false),
  ('a1000000-0000-4000-8000-000000000010', 'Loaded Fries',
   'Skin-on fries, melted cheese, jalapeño, herb salt',
   'https://images.unsplash.com/photo-1573080496219-bb080dd4f877', 'Sides', null, 16, true, false),
  ('a1000000-0000-4000-8000-000000000011', 'Peri Peri Fries',
   'Hand-cut fries tossed in peri peri seasoning',
   'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5', 'Sides', null, 17, true, false)
on conflict (id) do update
  set name        = excluded.name,
      description = excluded.description,
      image_url   = excluded.image_url,
      category    = excluded.category,
      badge       = excluded.badge,
      sort_order  = excluded.sort_order,
      is_active   = excluded.is_active,
      is_sold_out = excluded.is_sold_out;

insert into public.menu_item_sizes (menu_item_id, size, price, sort_order)
values
  ('a1000000-0000-4000-8000-000000000002', 'Medium', 1050, 1),
  ('a1000000-0000-4000-8000-000000000002', 'Large',  1550, 2),
  ('a1000000-0000-4000-8000-000000000003', 'Medium', 1100, 1),
  ('a1000000-0000-4000-8000-000000000003', 'Large',  1600, 2),
  ('a1000000-0000-4000-8000-000000000004', 'Medium', 1150, 1),
  ('a1000000-0000-4000-8000-000000000004', 'Large',  1690, 2),
  ('a1000000-0000-4000-8000-000000000005', 'Medium', 1150, 1),
  ('a1000000-0000-4000-8000-000000000005', 'Large',  1690, 2),
  ('a1000000-0000-4000-8000-000000000006', 'Medium',  890, 1),
  ('a1000000-0000-4000-8000-000000000006', 'Large',  1290, 2),
  ('a1000000-0000-4000-8000-000000000007', 'Medium', 1290, 1),
  ('a1000000-0000-4000-8000-000000000007', 'Large',  1850, 2),
  ('a1000000-0000-4000-8000-000000000008', 'Medium', 1250, 1),
  ('a1000000-0000-4000-8000-000000000008', 'Large',  1790, 2),
  ('a1000000-0000-4000-8000-000000000009', 'Medium', 1190, 1),
  ('a1000000-0000-4000-8000-000000000009', 'Large',  1730, 2),
  ('a1000000-0000-4000-8000-00000000000a', 'Medium', 1150, 1),
  ('a1000000-0000-4000-8000-00000000000a', 'Large',  1650, 2),
  ('a1000000-0000-4000-8000-00000000000b', 'Medium', 1290, 1),
  ('a1000000-0000-4000-8000-00000000000b', 'Large',  1850, 2),
  ('a1000000-0000-4000-8000-00000000000c', 'Medium', 1190, 1),
  ('a1000000-0000-4000-8000-00000000000c', 'Large',  1730, 2),
  ('a1000000-0000-4000-8000-00000000000d', 'Medium',  950, 1),
  ('a1000000-0000-4000-8000-00000000000d', 'Large',  1390, 2),
  ('a1000000-0000-4000-8000-00000000000e', 'Regular', 620, 1),
  ('a1000000-0000-4000-8000-00000000000e', 'Double',  890, 2),
  ('a1000000-0000-4000-8000-00000000000f', 'Regular', 560, 1),
  ('a1000000-0000-4000-8000-00000000000f', 'Double',  820, 2),
  ('a1000000-0000-4000-8000-000000000010', 'Regular', 390, 1),
  ('a1000000-0000-4000-8000-000000000010', 'Sharing', 590, 2),
  ('a1000000-0000-4000-8000-000000000011', 'Regular', 350, 1),
  ('a1000000-0000-4000-8000-000000000011', 'Sharing', 540, 2)
on conflict (menu_item_id, size) do update
  set price      = excluded.price,
      sort_order = excluded.sort_order;
