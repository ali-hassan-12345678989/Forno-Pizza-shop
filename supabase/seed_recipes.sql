-- Forno Pizza — ingredients, and the recipe/BOM behind every sellable size and
-- every extra topping.
--
-- RUN ORDER: after schema.sql and seed_menu.sql. Safe to re-run.
--
-- Part 1 created the `ingredients` and `recipes` tables and seeded exactly one
-- row of each as a smoke test. Part 3's inventory engine needs the real thing:
-- every size a customer can actually buy has to know what it consumes, or the
-- engine silently deducts nothing for it and the shop's stock quietly drifts
-- away from reality.
--
-- Nothing here is reachable from the browser. ingredients and recipes have no
-- policy and no grant for anon or authenticated — see the end of schema.sql.
-- Part 4 grants the Manager and Admin their deliberate access.
--
-- Quantities are per Medium pizza / per Regular burger or side. Larger sizes
-- are derived, not retyped — see SIZE FACTORS below.

-- ---------------------------------------------------------------------------
-- INGREDIENTS
--
-- on conflict DOES NOT touch stock_quantity. By the time this file is re-run,
-- that column is real inventory the Manager has been adding to in Part 4, and
-- resetting it to a seed value would be destroying a day's stock count. Units
-- and thresholds are corrections, so those do get applied.
-- ---------------------------------------------------------------------------

insert into public.ingredients (name, unit, stock_quantity, low_stock_threshold) values
  ('Pizza Dough',         'g',   40000, 8000),
  ('Pizza Sauce',         'ml',  18000, 3500),
  ('White Sauce',         'ml',   6000, 1200),
  ('Mozzarella',          'g',   25000, 5000),
  ('Cheddar',             'g',    6000, 1200),
  ('Parmesan',            'g',    3000,  600),
  ('Cream Cheese',        'g',    4000,  800),
  ('Cooked Chicken',      'g',   22000, 4500),
  ('Tikka Marinade',      'ml',   5000, 1000),
  ('Beef Strips',         'g',    8000, 1600),
  ('Chicken Pepperoni',   'g',    6000, 1200),
  ('Chicken Fillet',      'pcs',    180,   40),
  ('Onion',               'g',   12000, 2500),
  ('Capsicum',            'g',    9000, 1800),
  ('Green Chilli',        'g',    2500,  500),
  ('Mushroom',            'g',    7000, 1400),
  ('Black Olives',        'g',    4000,  800),
  ('Sweetcorn',           'g',    5000, 1000),
  ('Tomato',              'g',    6000, 1200),
  ('Jalapeno',            'g',    3500,  700),
  ('Fresh Basil',         'g',     800,  200),
  ('Coriander',           'g',    1200,  300),
  ('Lettuce',             'g',    4000,  800),
  ('Pickles',             'g',    2500,  500),
  ('Peri Peri Sauce',     'ml',   6000, 1200),
  ('Behari Sauce',        'ml',   4500,  900),
  ('Mayonnaise',          'ml',   8000, 1600),
  ('Cheese Sauce',        'ml',   7000, 1400),
  ('Burger Bun',          'pcs',    200,   45),
  ('Potato Fries',        'g',   30000, 6000),
  ('Peri Peri Seasoning', 'g',    2000,  400),
  ('Olive Oil',           'ml',   3000,  600)
on conflict (name) do update set
  unit                = excluded.unit,
  low_stock_threshold = excluded.low_stock_threshold;

-- ---------------------------------------------------------------------------
-- PIZZA RECIPES
--
-- Written once per pizza, at Medium, then scaled. A Large genuinely is about
-- 1.6x a Medium by area, and writing both out by hand would mean 26 lists to
-- keep in step instead of 13 — which is how a Large ends up quietly costing the
-- same as a Medium after someone edits one and not the other.
-- ---------------------------------------------------------------------------

with size_factor (size, factor) as (values
  ('Medium', 1.0), ('Large', 1.6)
),
spec (item, ingredient, qty) as (values
  -- Classics
  ('Chicken Tikka',     'Pizza Dough',       250),
  ('Chicken Tikka',     'Pizza Sauce',        80),
  ('Chicken Tikka',     'Mozzarella',        150),
  ('Chicken Tikka',     'Cooked Chicken',    120),
  ('Chicken Tikka',     'Tikka Marinade',     30),
  ('Chicken Tikka',     'Onion',              40),
  ('Chicken Tikka',     'Capsicum',           40),

  ('Chicken Fajita',    'Pizza Dough',       250),
  ('Chicken Fajita',    'Pizza Sauce',        80),
  ('Chicken Fajita',    'Mozzarella',        150),
  ('Chicken Fajita',    'Cooked Chicken',    120),
  ('Chicken Fajita',    'Capsicum',           50),
  ('Chicken Fajita',    'Onion',              50),

  ('Peri Peri',         'Pizza Dough',       250),
  ('Peri Peri',         'Pizza Sauce',        70),
  ('Peri Peri',         'Mozzarella',        150),
  ('Peri Peri',         'Cooked Chicken',    120),
  ('Peri Peri',         'Peri Peri Sauce',    40),
  ('Peri Peri',         'Onion',              40),
  ('Peri Peri',         'Capsicum',           40),

  ('Chicken Supreme',   'Pizza Dough',       250),
  ('Chicken Supreme',   'Pizza Sauce',        80),
  ('Chicken Supreme',   'Mozzarella',        150),
  ('Chicken Supreme',   'Cooked Chicken',    100),
  ('Chicken Supreme',   'Mushroom',           40),
  ('Chicken Supreme',   'Black Olives',       25),
  ('Chicken Supreme',   'Capsicum',           35),
  ('Chicken Supreme',   'Sweetcorn',          35),

  ('Chicken Pepperoni', 'Pizza Dough',       250),
  ('Chicken Pepperoni', 'Pizza Sauce',        90),
  ('Chicken Pepperoni', 'Mozzarella',        160),
  ('Chicken Pepperoni', 'Chicken Pepperoni',  90),

  ('Margherita',        'Pizza Dough',       250),
  ('Margherita',        'Pizza Sauce',        90),
  ('Margherita',        'Mozzarella',        180),
  ('Margherita',        'Fresh Basil',         5),
  ('Margherita',        'Olive Oil',          10),

  -- Signature
  ('Behari Kabab',      'Pizza Dough',       250),
  ('Behari Kabab',      'Pizza Sauce',        70),
  ('Behari Kabab',      'Mozzarella',        150),
  ('Behari Kabab',      'Beef Strips',       120),
  ('Behari Kabab',      'Behari Sauce',       40),
  ('Behari Kabab',      'Onion',              45),
  ('Behari Kabab',      'Coriander',           8),
  ('Behari Kabab',      'Green Chilli',       12),

  ('Malai Tikka',       'Pizza Dough',       250),
  ('Malai Tikka',       'White Sauce',        90),
  ('Malai Tikka',       'Mozzarella',        150),
  ('Malai Tikka',       'Cooked Chicken',    120),
  ('Malai Tikka',       'Coriander',           8),

  ('Chicken Tandoori',  'Pizza Dough',       250),
  ('Chicken Tandoori',  'Pizza Sauce',        80),
  ('Chicken Tandoori',  'Mozzarella',        150),
  ('Chicken Tandoori',  'Cooked Chicken',    120),
  ('Chicken Tandoori',  'Tikka Marinade',     25),
  ('Chicken Tandoori',  'Onion',              45),
  ('Chicken Tandoori',  'Capsicum',           40),
  ('Chicken Tandoori',  'Green Chilli',       10),

  ('Hot n Spicy',       'Pizza Dough',       250),
  ('Hot n Spicy',       'Pizza Sauce',        80),
  ('Hot n Spicy',       'Mozzarella',        150),
  ('Hot n Spicy',       'Cooked Chicken',    120),
  ('Hot n Spicy',       'Jalapeno',           30),
  ('Hot n Spicy',       'Onion',              40),
  ('Hot n Spicy',       'Green Chilli',       15),

  ('Cheese Lover',      'Pizza Dough',       250),
  ('Cheese Lover',      'Pizza Sauce',        80),
  ('Cheese Lover',      'Mozzarella',        170),
  ('Cheese Lover',      'Cheddar',            60),
  ('Cheese Lover',      'Parmesan',           25),
  ('Cheese Lover',      'Cream Cheese',       45),

  ('Chicken Mushroom',  'Pizza Dough',       250),
  ('Chicken Mushroom',  'White Sauce',        80),
  ('Chicken Mushroom',  'Mozzarella',        150),
  ('Chicken Mushroom',  'Cooked Chicken',    110),
  ('Chicken Mushroom',  'Tikka Marinade',     25),
  ('Chicken Mushroom',  'Mushroom',           60),
  ('Chicken Mushroom',  'Onion',              35),

  ('Only Veggie',       'Pizza Dough',       250),
  ('Only Veggie',       'Pizza Sauce',        85),
  ('Only Veggie',       'Mozzarella',        150),
  ('Only Veggie',       'Black Olives',       30),
  ('Only Veggie',       'Mushroom',           45),
  ('Only Veggie',       'Tomato',             45),
  ('Only Veggie',       'Onion',              40),
  ('Only Veggie',       'Capsicum',           40),
  ('Only Veggie',       'Sweetcorn',          35)
)
insert into public.recipes (menu_item_size_id, ingredient_id, quantity)
select ms.id, ing.id, round((s.qty * f.factor)::numeric, 3)
from spec s
join public.menu_items      mi  on mi.name = s.item
join public.menu_item_sizes ms  on ms.menu_item_id = mi.id
join size_factor            f   on f.size = ms.size
join public.ingredients     ing on ing.name = s.ingredient
on conflict (menu_item_size_id, ingredient_id) do update
  set quantity = excluded.quantity;

-- ---------------------------------------------------------------------------
-- BURGERS AND SIDES
--
-- Written out per size rather than scaled. A Double burger is two fillets in
-- one bun, not 1.8 of each — a multiplier would order 1.8 buns, and "pcs" is
-- not a thing you can have 0.8 of.
-- ---------------------------------------------------------------------------

with spec (item, size, ingredient, qty) as (values
  ('Fiery Fillet Burger',   'Regular', 'Burger Bun',            1),
  ('Fiery Fillet Burger',   'Regular', 'Chicken Fillet',        1),
  ('Fiery Fillet Burger',   'Regular', 'Lettuce',              20),
  ('Fiery Fillet Burger',   'Regular', 'Mayonnaise',           25),
  ('Fiery Fillet Burger',   'Regular', 'Peri Peri Seasoning',   5),

  ('Fiery Fillet Burger',   'Double',  'Burger Bun',            1),
  ('Fiery Fillet Burger',   'Double',  'Chicken Fillet',        2),
  ('Fiery Fillet Burger',   'Double',  'Lettuce',              25),
  ('Fiery Fillet Burger',   'Double',  'Mayonnaise',           35),
  ('Fiery Fillet Burger',   'Double',  'Peri Peri Seasoning',   8),

  ('Crunch Chicken Burger', 'Regular', 'Burger Bun',            1),
  ('Crunch Chicken Burger', 'Regular', 'Chicken Fillet',        1),
  ('Crunch Chicken Burger', 'Regular', 'Mayonnaise',           30),
  ('Crunch Chicken Burger', 'Regular', 'Pickles',              15),
  ('Crunch Chicken Burger', 'Regular', 'Lettuce',              15),

  ('Crunch Chicken Burger', 'Double',  'Burger Bun',            1),
  ('Crunch Chicken Burger', 'Double',  'Chicken Fillet',        2),
  ('Crunch Chicken Burger', 'Double',  'Mayonnaise',           40),
  ('Crunch Chicken Burger', 'Double',  'Pickles',              22),
  ('Crunch Chicken Burger', 'Double',  'Lettuce',              18),

  ('Loaded Fries',          'Regular', 'Potato Fries',        200),
  ('Loaded Fries',          'Regular', 'Cheese Sauce',         60),
  ('Loaded Fries',          'Regular', 'Jalapeno',             20),

  ('Loaded Fries',          'Sharing', 'Potato Fries',        380),
  ('Loaded Fries',          'Sharing', 'Cheese Sauce',        110),
  ('Loaded Fries',          'Sharing', 'Jalapeno',             35),

  ('Peri Peri Fries',       'Regular', 'Potato Fries',        200),
  ('Peri Peri Fries',       'Regular', 'Peri Peri Seasoning',   8),

  ('Peri Peri Fries',       'Sharing', 'Potato Fries',        380),
  ('Peri Peri Fries',       'Sharing', 'Peri Peri Seasoning',  15)
)
insert into public.recipes (menu_item_size_id, ingredient_id, quantity)
select ms.id, ing.id, s.qty
from spec s
join public.menu_items      mi  on mi.name = s.item
join public.menu_item_sizes ms  on ms.menu_item_id = mi.id and ms.size = s.size
join public.ingredients     ing on ing.name = s.ingredient
on conflict (menu_item_size_id, ingredient_id) do update
  set quantity = excluded.quantity;

-- ---------------------------------------------------------------------------
-- WHAT AN EXTRA TOPPING CONSUMES
--
-- `recipes` is keyed by sellable size, so it describes the standard pizza and
-- nothing else. An extra ordered on top of it is real food off the same shelf —
-- "Extra Cheese" is mozzarella, and it is the same mozzarella the recipe above
-- already counts. Without this table those grams leave the building without
-- ever being deducted, and the shop finds out when the walk-in is empty while
-- the screen still says there is cheese.
--
-- A portion is flat, not scaled by pizza size: a topping is a scoop, and the
-- kitchen uses the same scoop on a Medium as on a Large. The base recipe scales
-- because the dough and the sauce genuinely do; a handful of olives does not.
-- ---------------------------------------------------------------------------

create table if not exists public.topping_recipes (
  id             uuid primary key default gen_random_uuid(),
  topping_id     uuid          not null references public.toppings(id)    on delete cascade,
  ingredient_id  uuid          not null references public.ingredients(id) on delete restrict,
  quantity       numeric(12,3) not null check (quantity > 0),
  created_at     timestamptz   not null default now(),
  unique (topping_id, ingredient_id)
);

-- Staff data, exactly like recipes: RLS on, and deliberately no policy and no
-- grant for anon or authenticated. Part 4 grants Manager and Admin.
alter table public.topping_recipes enable row level security;

with spec (topping, ingredient, qty) as (values
  -- The paid extras. These two matter most: they come off the same shelves the
  -- base recipes already draw down, so missing them makes mozzarella and
  -- chicken read high all day.
  ('Extra Cheese',   'Mozzarella',      70),
  ('Chicken Chunks', 'Cooked Chicken',  60),
  ('Mushroom',       'Mushroom',        40),
  ('Jalapeno',       'Jalapeno',        25),
  ('Olives',         'Black Olives',    25),
  ('Pickle',         'Pickles',         20),
  -- Free to the customer, not free to the shop. An onion still leaves the
  -- store when it goes on a pizza.
  ('Capsicum',       'Capsicum',        35),
  ('Green Chilli',   'Green Chilli',    12),
  ('Onion',          'Onion',           35)
)
insert into public.topping_recipes (topping_id, ingredient_id, quantity)
select t.id, ing.id, s.qty
from spec s
join public.toppings    t   on t.name = s.topping
join public.ingredients ing on ing.name = s.ingredient
on conflict (topping_id, ingredient_id) do update
  set quantity = excluded.quantity;


-- ---------------------------------------------------------------------------
-- COVERAGE
--
-- The one thing that must never come back with rows. A sellable size with no
-- recipe is not an error anywhere — it simply consumes nothing, for ever, and
-- the shop finds out when it runs out of cheese it thought it had.
-- ---------------------------------------------------------------------------

-- Reported as a verdict rather than as rows, because "no rows returned" is the
-- same thing the editor shows when a query silently matched nothing.

with uncovered as (
  select mi.name || ' / ' || ms.size as what
  from public.menu_item_sizes ms
  join public.menu_items mi on mi.id = ms.menu_item_id
  where not exists (select 1 from public.recipes r where r.menu_item_size_id = ms.id)

  union all

  -- A topping with no ingredient behind it is the same silent hole as a size
  -- with no recipe: it is sold, it is eaten, and nothing is deducted.
  select 'topping: ' || t.name
  from public.toppings t
  where not exists (select 1 from public.topping_recipes tr where tr.topping_id = t.id)
)
select
  case when (select count(*) from uncovered) = 0
       then format(
         '*** OK — %s sizes and %s toppings all covered (%s ingredients, %s recipe rows, %s topping rows) ***',
         (select count(*) from public.menu_item_sizes),
         (select count(*) from public.toppings),
         (select count(*) from public.ingredients),
         (select count(*) from public.recipes),
         (select count(*) from public.topping_recipes))
       else format('*** %s NOT COVERED: %s ***',
                   (select count(*) from uncovered),
                   (select string_agg(what, ', ') from uncovered))
  end as verdict;
