-- Forno Pizza — put every ingredient back to its seeded level.
--
-- DESTRUCTIVE, AND ONLY FOR A TEST DATABASE. This overwrites stock_quantity
-- outright. Run it on a live shop and you erase the Manager's real stock count.
--
-- WHY IT EXISTS
-- An early version of cleanup_test_data.sql handed every historical test order
-- to restore_order_stock(), including the hundreds placed before the deduction
-- was built. Those orders had never taken anything out, so refunding them
-- created inventory from nothing — pizza dough reached 588kg against a seeded
-- 40kg. The numbers are fiction and the only honest fix is to set them back.
--
-- The hole that allowed it is closed: orders.stock_deducted now records whether
-- a charge actually happened, and restore_order_stock() refuses to refund an
-- order that never took anything. Re-run deduct_stock.sql before this.
--
-- Safe to re-run. Levels match seed_recipes.sql exactly.

update public.ingredients i
   set stock_quantity      = seed.qty,
       low_stock_threshold = seed.threshold
from (values
  ('Pizza Dough', 40000, 8000),
  ('Pizza Sauce', 18000, 3500),
  ('White Sauce', 6000, 1200),
  ('Mozzarella', 25000, 5000),
  ('Cheddar', 6000, 1200),
  ('Parmesan', 3000, 600),
  ('Cream Cheese', 4000, 800),
  ('Cooked Chicken', 22000, 4500),
  ('Tikka Marinade', 5000, 1000),
  ('Beef Strips', 8000, 1600),
  ('Chicken Pepperoni', 6000, 1200),
  ('Chicken Fillet', 180, 40),
  ('Onion', 12000, 2500),
  ('Capsicum', 9000, 1800),
  ('Green Chilli', 2500, 500),
  ('Mushroom', 7000, 1400),
  ('Black Olives', 4000, 800),
  ('Sweetcorn', 5000, 1000),
  ('Tomato', 6000, 1200),
  ('Jalapeno', 3500, 700),
  ('Fresh Basil', 800, 200),
  ('Coriander', 1200, 300),
  ('Lettuce', 4000, 800),
  ('Pickles', 2500, 500),
  ('Peri Peri Sauce', 6000, 1200),
  ('Behari Sauce', 4500, 900),
  ('Mayonnaise', 8000, 1600),
  ('Cheese Sauce', 7000, 1400),
  ('Burger Bun', 200, 45),
  ('Potato Fries', 30000, 6000),
  ('Peri Peri Seasoning', 2000, 400),
  ('Olive Oil', 3000, 600)
) as seed (name, qty, threshold)
where i.name = seed.name;

-- Nothing is "owed" any more either: every order in the table has now had its
-- stock position reset along with the shelves.
update public.orders set stock_deducted = false where stock_deducted;

select
  i.name, i.unit, i.stock_quantity, i.low_stock_threshold,
  case when i.stock_quantity < i.low_stock_threshold then '*** LOW ***' else '' end as flag
from public.ingredients i
order by i.name;
