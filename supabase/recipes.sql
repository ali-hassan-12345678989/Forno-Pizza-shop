-- Forno Pizza — turning an order into a list of ingredients.
--
-- RUN ORDER: after schema.sql, seed_menu.sql and seed_recipes.sql.
-- Safe to re-run.
--
-- This is the read half of the inventory engine. It answers one question —
-- "what does this order consume?" — and nothing else. Deducting is Part 3's
-- task 4, and it builds on exactly this.
--
-- It counts the standard recipe AND the extras ordered on top of it. The shop
-- chose to track extras rather than reconcile them at the till: an extra cheese
-- is 70g of real mozzarella off the same shelf, and a stock figure that ignores
-- it reads high all through service — which is exactly when task 7's automatic
-- sold-out needs it to be right.
--
-- Nothing here is callable from the browser. The recipes are the shop's own
-- costings: a customer who could call this would learn the exact gram weight of
-- every pizza on the menu from a single order. Part 4 grants the Manager and
-- Admin their deliberate access.

-- ---------------------------------------------------------------------------
-- DROP BEFORE CREATE
--
-- `create or replace function` cannot change a function's return type. Postgres
-- refuses with 42P13 — and because the SQL editor runs a whole file in one
-- transaction, that refusal rolls back every statement before it too. The file
-- then looks like it "errored on the last bit" while actually having applied
-- nothing at all, which is a genuinely confusing way to lose an afternoon.
--
-- sizes_missing_recipes() gained a `kind` column when toppings started being
-- tracked, which is exactly that situation. Dropping first makes this file
-- re-runnable across a shape change instead of only across a body change.
-- ---------------------------------------------------------------------------

drop function if exists public.order_ingredient_requirements(uuid);
drop function if exists public.sizes_missing_recipes();


-- ---------------------------------------------------------------------------
-- WHAT ONE ORDER CONSUMES
--
-- Two sources, one answer.
--
--   * the pizza itself  <- recipes,         keyed by the sellable size
--   * the extras on it  <- topping_recipes, keyed by the topping
--
-- Separate tables because they answer different questions, but they draw on the
-- SAME shelves: "Extra Cheese" is mozzarella, and so is the 150g already in the
-- Chicken Tikka underneath it. So the two are unioned and then grouped, and the
-- caller sees one mozzarella row holding the lot.
--
-- That GROUP BY is the point of the whole function. Task 4 locks a row per
-- ingredient before deducting; handed mozzarella three times — twice from
-- recipes, once from a topping — it would take the lock, deduct, and then come
-- back for a second and third bite against a number it had already changed.
--
-- Multiplication is per line, not per pizza: two Larges with extra cheese is
-- one order_items row with quantity 2 and one order_item_toppings row, so the
-- extra is counted twice, which is how many were actually made.
-- ---------------------------------------------------------------------------

create or replace function public.order_ingredient_requirements(p_order_id uuid)
returns table (
  ingredient_id uuid,
  ingredient    text,
  unit          text,
  required      numeric,
  in_stock      numeric
)
language sql
security definer
set search_path = public
stable
as $$
  with needed as (
    -- The standard pizza, burger or side.
    select r.ingredient_id, r.quantity * oi.quantity as qty
    from public.order_items oi
    join public.recipes r on r.menu_item_size_id = oi.menu_item_size_id
    where oi.order_id = p_order_id

    union all

    -- Whatever was added on top of it. order_item_toppings holds one row per
    -- extra per line; a topping retired since the order was placed leaves
    -- topping_id null and drops out of this join, which is right — the name and
    -- price snapshot on the receipt survive either way, but there is no live
    -- recipe left to deduct against.
    select tr.ingredient_id, tr.quantity * oi.quantity as qty
    from public.order_items oi
    join public.order_item_toppings oit on oit.order_item_id = oi.id
    join public.topping_recipes     tr  on tr.topping_id = oit.topping_id
    where oi.order_id = p_order_id
  )
  select
    n.ingredient_id,
    i.name,
    i.unit,
    sum(n.qty)::numeric(12,3),
    i.stock_quantity
  from needed n
  join public.ingredients i on i.id = n.ingredient_id
  group by n.ingredient_id, i.name, i.unit, i.stock_quantity
  -- Ordered for a human reading the result. Task 4 re-orders by ingredient_id
  -- when it takes locks: a consistent lock order is what stops two orders that
  -- share ingredients from deadlocking, and that is its concern, not this
  -- function's.
  order by i.name;
$$;

-- ---------------------------------------------------------------------------
-- COVERAGE
--
-- The quiet failure this engine has. A sellable size with no recipe rows — or a
-- topping with no ingredient behind it — is not an error anywhere:
-- order_ingredient_requirements() just returns nothing for it, the deduction
-- deducts nothing, and every report agrees that the shop still has all its
-- cheese. It shows up weeks later as a stock count that does not match the
-- shelf.
--
-- So it gets a function rather than a comment telling someone to remember.
-- ---------------------------------------------------------------------------

create or replace function public.sizes_missing_recipes()
returns table (kind text, item text, size text, is_active boolean)
language sql
security definer
set search_path = public
stable
as $$
  select 'size'::text, mi.name, ms.size, mi.is_active
  from public.menu_item_sizes ms
  join public.menu_items mi on mi.id = ms.menu_item_id
  where not exists (
    select 1 from public.recipes r where r.menu_item_size_id = ms.id
  )

  union all

  -- A topping with nothing behind it is the same hole wearing a different hat:
  -- sold, eaten, and deducted from nothing.
  select 'topping'::text, t.name, null::text, t.is_active
  from public.toppings t
  where not exists (
    select 1 from public.topping_recipes tr where tr.topping_id = t.id
  )

  order by 4 desc, 1, 2;
$$;

-- ---------------------------------------------------------------------------
-- ACCESS
--
-- Postgres grants EXECUTE to PUBLIC by default, and both of these are SECURITY
-- DEFINER — they reach tables that have no grant and no policy for any customer
-- role precisely so that nobody outside the shop can read them. Leaving the
-- default in place would hand that back through the front door.
-- ---------------------------------------------------------------------------

revoke execute on function public.order_ingredient_requirements(uuid) from public;
revoke execute on function public.sizes_missing_recipes()             from public;


-- ---------------------------------------------------------------------------
-- LOOKING AT AN ORDER BY HAND
--
--   select * from public.order_ingredient_requirements(
--     (select id from public.orders where order_number = '2673'));
--
--   select * from public.sizes_missing_recipes();   -- should return no rows
-- ---------------------------------------------------------------------------
