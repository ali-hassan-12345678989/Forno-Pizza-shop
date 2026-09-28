-- ---------------------------------------------------------------------------
-- Forno Pizza — GO LIVE RESET.
--
-- Puts the database into the state it should be in on the morning the shop
-- starts taking real customers: no sales history, no orders, no reviews, no
-- stock alerts, and every ingredient back at its full opening level.
--
-- *** THIS DELETES EVERY ORDER IN THE DATABASE. ***
-- Run it ONCE, before the first real customer. Running it after the shop has
-- taken real money destroys the shop's own records. There is no undo.
--
-- WHAT IT DELIBERATELY DOES NOT TOUCH
--   menu_items, menu_item_sizes, recipes, toppings  — the shop's menu and BOM
--   shop_settings                                   — name, phone, delivery fee
--   staff                                           — the Manager and Admin roles
--   auth.users                                      — see the note at the end
-- Those are configuration, not test data. Wiping them would mean rebuilding
-- the shop, not resetting it.
--
-- RUN ORDER: this file is self-contained. Paste it into the Supabase SQL
-- Editor and run the whole thing in one go — it reports before and after.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 0. WHERE THINGS STAND BEFORE THE RESET
-- Printed first so there is a record of what was thrown away.
-- ---------------------------------------------------------------------------

do $$
declare
  v_orders    bigint;
  v_cancelled bigint;
  v_open      bigint;
  v_revenue   numeric;
  v_items     bigint;
  v_reviews   bigint;
  v_alerts    bigint;
  v_seq       bigint;
begin
  select count(*),
         count(*) filter (where status = 'cancelled'),
         count(*) filter (where public.order_is_active(status, fulfillment_type)),
         coalesce(sum(total) filter (where status <> 'cancelled'), 0)
    into v_orders, v_cancelled, v_open, v_revenue
    from public.orders;

  select count(*) into v_items   from public.order_items;
  select count(*) into v_reviews from public.reviews;
  select count(*) into v_alerts  from public.stock_alerts;
  select last_value into v_seq   from public.order_number_seq;

  raise notice '=== BEFORE ===';
  raise notice 'orders            : %  (cancelled %, still open %)', v_orders, v_cancelled, v_open;
  raise notice 'order lines       : %', v_items;
  raise notice 'reported revenue  : Rs %', v_revenue;
  raise notice 'reviews           : %', v_reviews;
  raise notice 'stock alerts      : %', v_alerts;
  raise notice 'order number seq  : % (next order would be #%)', v_seq, v_seq + 1;
end $$;


-- ---------------------------------------------------------------------------
-- 1. DELETE EVERY ORDER
--
-- order_items, order_item_toppings, order_status_history and reviews are all
-- ON DELETE CASCADE from orders, so this one statement clears the lot.
--
-- No stock is refunded on the way out, and that is on purpose. Every other
-- clean-up file in this folder hands ingredients back through
-- restore_order_stock() because it is removing SOME orders and the shelves
-- have to stay honest about the rest. Here the shelves are being set outright
-- in step 4, so refunding first would only add to a number that is about to be
-- overwritten. (That mistake is what once inflated pizza dough to 588kg.)
-- ---------------------------------------------------------------------------

delete from public.orders;


-- ---------------------------------------------------------------------------
-- 2. CLEAR THE STOCK LEDGER
--
-- Movements caused by an order cascade away with it above. Deliveries do not:
-- receive_stock() writes a row with no order_id, so a book-in from the test
-- period would survive and the shop's first usage report would open with
-- history it never had.
-- ---------------------------------------------------------------------------

delete from public.stock_movements;


-- ---------------------------------------------------------------------------
-- 3. CLEAR THE ALERT HISTORY
--
-- stock_alerts is a log of past shortages, including resolved ones. All of it
-- belongs to the test period, and none of it should greet the Manager on day
-- one. Ingredients are about to be full, so no alert is owed.
-- ---------------------------------------------------------------------------

delete from public.stock_alerts;


-- ---------------------------------------------------------------------------
-- 4. FILL THE SHELVES
--
-- Opening levels and thresholds, identical to seed_recipes.sql. Both columns
-- are set, not just the quantity, so a threshold edited during testing goes
-- back to the agreed figure too.
--
-- This also repairs the rounding drift that testing left behind: refund
-- arithmetic had pushed Beef Strips to 8037.57 g, a quantity that was never
-- delivered and never sold.
-- ---------------------------------------------------------------------------

update public.ingredients i
   set stock_quantity      = opening.qty,
       low_stock_threshold = opening.threshold
from (values
  ('Pizza Dough',         40000,  8000),
  ('Pizza Sauce',         18000,  3500),
  ('White Sauce',          6000,  1200),
  ('Mozzarella',          25000,  5000),
  ('Cheddar',              6000,  1200),
  ('Parmesan',             3000,   600),
  ('Cream Cheese',         4000,   800),
  ('Cooked Chicken',      22000,  4500),
  ('Tikka Marinade',       5000,  1000),
  ('Beef Strips',          8000,  1600),
  ('Chicken Pepperoni',    6000,  1200),
  ('Chicken Fillet',        180,    40),
  ('Onion',               12000,  2500),
  ('Capsicum',             9000,  1800),
  ('Green Chilli',         2500,   500),
  ('Mushroom',             7000,  1400),
  ('Black Olives',         4000,   800),
  ('Sweetcorn',            5000,  1000),
  ('Tomato',               6000,  1200),
  ('Jalapeno',             3500,   700),
  ('Fresh Basil',           800,   200),
  ('Coriander',            1200,   300),
  ('Lettuce',              4000,   800),
  ('Pickles',              2500,   500),
  ('Peri Peri Sauce',      6000,  1200),
  ('Behari Sauce',         4500,   900),
  ('Mayonnaise',           8000,  1600),
  ('Cheese Sauce',         7000,  1400),
  ('Burger Bun',            200,    45),
  ('Potato Fries',        30000,  6000),
  ('Peri Peri Seasoning',  2000,   400),
  ('Olive Oil',            3000,   600)
) as opening (name, qty, threshold)
where i.name = opening.name;


-- ---------------------------------------------------------------------------
-- 5. PUT THE WHOLE MENU BACK ON SALE
--
-- Two separate flags, and both have to be cleared (see sold_out.sql):
--   is_sold_out   pulled by hand during testing
--   out_of_stock  the engine's own reading, recomputed by refresh_sold_out()
-- is_active is forced true as well, so an item hidden while testing the Admin
-- panel does not quietly stay off the customer menu on opening day.
-- ---------------------------------------------------------------------------

update public.menu_items
   set is_sold_out = false,
       is_active   = true
 where is_sold_out or not is_active;

select public.refresh_sold_out();


-- ---------------------------------------------------------------------------
-- 6. START ORDER NUMBERS AT 1000 AGAIN
--
-- Testing pushed the sequence past 14,000, so the first real customer would
-- otherwise be handed #14791 — a number that tells anyone reading it the shop
-- has sold fourteen thousand pizzas it has not sold.
--
-- fix_order_number.sql warns, correctly, that rewinding this sequence re-issues
-- numbers that were already handed out. That warning applies to a table that
-- still holds those orders. Step 1 emptied it, so there is nothing left to
-- collide with — and the guard below refuses to rewind if that is not actually
-- true, rather than taking step 1's word for it.
-- ---------------------------------------------------------------------------

do $$
declare
  v_left bigint;
begin
  select count(*) into v_left from public.orders;

  if v_left > 0 then
    raise exception
      'Refusing to rewind order_number_seq: % order(s) still present. '
      'Rewinding now would re-issue numbers those orders already hold.', v_left;
  end if;

  alter sequence public.order_number_seq restart with 1000;
  raise notice 'order_number_seq rewound — the first real order will be #1000';
end $$;


-- ---------------------------------------------------------------------------
-- 7. VERIFY, AND REFUSE TO CLAIM SUCCESS OTHERWISE
-- ---------------------------------------------------------------------------

do $$
declare
  v_fail      int := 0;
  v_orders    bigint;
  v_items     bigint;
  v_history   bigint;
  v_reviews   bigint;
  v_alerts    bigint;
  v_short     bigint;
  v_unavail   bigint;
  v_seq       bigint;
  v_ings      bigint;
  v_moves     bigint;
begin
  select count(*) into v_orders  from public.orders;
  select count(*) into v_items   from public.order_items;
  select count(*) into v_history from public.order_status_history;
  select count(*) into v_reviews from public.reviews;
  select count(*) into v_alerts  from public.stock_alerts;
  select count(*) into v_ings    from public.ingredients;
  select count(*) into v_moves   from public.stock_movements;

  select count(*) into v_short
    from public.ingredients
   where stock_quantity < low_stock_threshold or stock_quantity <= 0;

  select count(*) into v_unavail
    from public.menu_items
   where is_sold_out or out_of_stock or not is_active;

  select last_value into v_seq from public.order_number_seq;

  raise notice '=== AFTER ===';
  raise notice 'orders / lines / history : % / % / %', v_orders, v_items, v_history;
  raise notice 'reviews / stock alerts   : % / %', v_reviews, v_alerts;
  raise notice 'stock ledger rows        : %', v_moves;
  raise notice 'ingredients              : % rows, % below threshold', v_ings, v_short;
  raise notice 'menu items unavailable   : %', v_unavail;
  raise notice 'next order number        : #%', v_seq;

  if v_orders  <> 0 then raise warning 'FAILED: orders not empty';          v_fail := v_fail + 1; end if;
  if v_items   <> 0 then raise warning 'FAILED: order_items not empty';     v_fail := v_fail + 1; end if;
  if v_history <> 0 then raise warning 'FAILED: status history not empty';  v_fail := v_fail + 1; end if;
  if v_reviews <> 0 then raise warning 'FAILED: reviews not empty';         v_fail := v_fail + 1; end if;
  if v_alerts  <> 0 then raise warning 'FAILED: stock alerts not empty';    v_fail := v_fail + 1; end if;
  if v_moves   <> 0 then raise warning 'FAILED: stock ledger not empty';    v_fail := v_fail + 1; end if;
  if v_short   <> 0 then raise warning 'FAILED: % ingredient(s) still short', v_short; v_fail := v_fail + 1; end if;
  if v_unavail <> 0 then raise warning 'FAILED: % menu item(s) unavailable',  v_unavail; v_fail := v_fail + 1; end if;
  if v_seq     <> 1000 then raise warning 'FAILED: sequence is at %, expected 1000', v_seq; v_fail := v_fail + 1; end if;

  -- Every ingredient named above must actually exist, or the UPDATE silently
  -- skipped one and "no shortages" only means the row was never looked at.
  if v_ings <> 32 then
    raise warning 'FAILED: expected 32 ingredients, found %', v_ings;
    v_fail := v_fail + 1;
  end if;

  if v_fail = 0 then
    raise notice '--- ZERO METER. The shop is ready for its first real customer. ---';
  else
    raise exception '--- % CHECK(S) FAILED — do not open on this database ---', v_fail;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- THE OPENING SHELF, FOR THE RECORD
-- ---------------------------------------------------------------------------

select
  i.name,
  i.unit,
  i.stock_quantity      as opening_stock,
  i.low_stock_threshold as reorder_at
from public.ingredients i
order by i.name;

-- ---------------------------------------------------------------------------
-- ONE THING THIS FILE LEAVES TO YOU
--
-- auth.users still holds the accounts created while testing, including the two
-- staff logins. They own nothing now — orders.user_id is ON DELETE SET NULL and
-- every order is gone — so they are harmless, and deleting the wrong one locks
-- the Manager or the Admin out of the panel. Remove the customer test accounts
-- by hand in Authentication -> Users if you want them gone, and keep the two
-- staff addresses listed in supabase/seed_staff.sql.
-- ---------------------------------------------------------------------------
