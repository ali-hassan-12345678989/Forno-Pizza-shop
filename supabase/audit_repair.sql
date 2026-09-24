-- ---------------------------------------------------------------------------
-- Forno Pizza — REPAIR AFTER THE SECURITY AUDIT.
--
-- The audit on 2026-09-24 probed the Admin-only menu functions by calling them
-- for real as a genuine Admin, to prove the role gate is enforced in the
-- database and not merely hidden in the UI. It is enforced — but two of those
-- probes therefore SUCCEEDED, because an Admin is allowed to do them, and they
-- changed live menu data:
--
--   1. admin_save_menu_item renamed "Crunch Chicken Burger" to
--      "AUDIT-PROBE-RENAME".
--   2. admin_delete_menu_size deleted Chicken Tikka "Medium"
--      (id 22222222-2222-2222-2222-222222222222, Rs 1050), and that delete
--      cascaded away the seven recipe rows behind it.
--
-- go_live_reset.sql does NOT undo this: it deliberately never touches the menu
-- or the recipes, because those are configuration rather than test data.
--
-- Run this file once. It is safe to re-run, and it verifies itself at the end.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. PUT THE BURGER BACK
--
-- The first version of this file restored only the name, which was not enough.
-- admin_save_menu_item() takes the whole row rather than one column, so the
-- audit's probe rewrote every field it passed — and it passed a made-up
-- category ('pizza') and a sort order of 1. The name looked right afterwards
-- while the item sat first on the customer menu under a category that does not
-- exist. Regression testing caught it; the lesson is that "restore the field I
-- noticed" is not a restore.
--
-- All values from seed_menu.sql, which is the record of what this row was.
-- ---------------------------------------------------------------------------

update public.menu_items
   set name        = 'Crunch Chicken Burger',
       description = 'Crispy chicken fillet, signature spicy mayo, pickles',
       image_url   = 'https://images.unsplash.com/photo-1571091718767-18b5b1457add',
       category    = 'Burgers',
       badge       = null,
       sort_order  = 15,
       is_active   = true,
       is_sold_out = false
 where id = 'a1000000-0000-4000-8000-00000000000f';


-- ---------------------------------------------------------------------------
-- 2. PUT THE DELETED SIZE BACK, WITH ITS ORIGINAL ID
--
-- The id matters and a fresh one will not do. tests/helpers/supabase.js pins
-- this exact uuid as STOCK.sizeMediumId, and tests/admin-orders.test.js orders
-- against it by literal, so a new id would leave the suite red. It is also the
-- id seed_menu.sql reaches for when it sets the price.
--
-- Price, sort order and the "serves" label are from seed_menu.sql and
-- toppings.sql respectively.
-- ---------------------------------------------------------------------------

insert into public.menu_item_sizes (id, menu_item_id, size, price, serves, sort_order)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Medium',
  1050,
  'Serves 2',
  1
)
on conflict (id) do update
  set price      = excluded.price,
      serves     = excluded.serves,
      sort_order = excluded.sort_order;


-- ---------------------------------------------------------------------------
-- 3. PUT ITS RECIPE BACK
--
-- recipes.menu_item_size_id is ON DELETE CASCADE, so removing the size took
-- the bill of materials with it. Without these rows a Medium Chicken Tikka
-- would sell and deduct nothing at all — the pizza leaves the shop and the
-- shelves still claim the ingredients are there.
--
-- Quantities are the Chicken Tikka block of seed_recipes.sql at the Medium
-- factor, which is 1.0, so they are the spec figures unchanged.
-- ---------------------------------------------------------------------------

insert into public.recipes (menu_item_size_id, ingredient_id, quantity)
select '22222222-2222-2222-2222-222222222222', i.id, spec.qty
from (values
  ('Pizza Dough',    250),
  ('Pizza Sauce',     80),
  ('Mozzarella',     150),
  ('Cooked Chicken', 120),
  ('Tikka Marinade',  30),
  ('Onion',           40),
  ('Capsicum',        40)
) as spec (ingredient, qty)
join public.ingredients i on i.name = spec.ingredient
on conflict (menu_item_size_id, ingredient_id) do update
  set quantity = excluded.quantity;


-- ---------------------------------------------------------------------------
-- 4. VERIFY, AND REFUSE TO CLAIM SUCCESS OTHERWISE
-- ---------------------------------------------------------------------------

do $$
declare
  v_fail  int := 0;
  v_name  text;
  v_cat   text;
  v_sort  int;
  v_price numeric;
  v_rows  int;
  v_sizes int;
begin
  select name, category, sort_order into v_name, v_cat, v_sort
    from public.menu_items
   where id = 'a1000000-0000-4000-8000-00000000000f';

  select price into v_price from public.menu_item_sizes
   where id = '22222222-2222-2222-2222-222222222222';

  select count(*) into v_rows from public.recipes
   where menu_item_size_id = '22222222-2222-2222-2222-222222222222';

  select count(*) into v_sizes from public.menu_item_sizes;

  raise notice 'burger name           : %', v_name;
  raise notice 'burger category/sort  : % / %', v_cat, v_sort;
  raise notice 'Chicken Tikka Medium  : Rs %', v_price;
  raise notice 'its recipe rows       : %', v_rows;
  raise notice 'menu_item_sizes total : %', v_sizes;

  if v_name is distinct from 'Crunch Chicken Burger' then
    raise warning 'FAILED: burger is still named %', v_name; v_fail := v_fail + 1;
  end if;
  if v_cat is distinct from 'Burgers' then
    raise warning 'FAILED: burger category is %, expected Burgers', v_cat; v_fail := v_fail + 1;
  end if;
  if v_sort is distinct from 15 then
    raise warning 'FAILED: burger sort_order is %, expected 15', v_sort; v_fail := v_fail + 1;
  end if;
  if v_price is distinct from 1050 then
    raise warning 'FAILED: Medium price is %, expected 1050', v_price; v_fail := v_fail + 1;
  end if;
  if v_rows <> 7 then
    raise warning 'FAILED: % recipe rows, expected 7', v_rows; v_fail := v_fail + 1;
  end if;
  if v_sizes <> 34 then
    raise warning 'FAILED: % sizes, expected 34', v_sizes; v_fail := v_fail + 1;
  end if;

  if v_fail = 0 then
    raise notice '--- REPAIRED. The menu is back to what it was before the audit. ---';
  else
    raise exception '--- % CHECK(S) FAILED ---', v_fail;
  end if;
end $$;
