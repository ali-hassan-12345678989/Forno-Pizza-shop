-- ---------------------------------------------------------------------------
-- Part 4, task 7: the Admin manages the menu.
--
-- FR-7.2  Admin can add, edit or remove menu items (name, description, price,
--         size options, image, availability)
-- FR-6.5  Manager cannot edit the menu
--
-- WHAT THE ADMIN MAY AND MAY NOT TOUCH
-- menu_items carries two different "unavailable" flags, and Part 3 was
-- deliberate about the difference (see sold_out.sql):
--
--   is_sold_out   a person's decision. "We are not making this today."
--   out_of_stock  the engine's observation. An ingredient it needs is at zero.
--
-- The Admin owns the first. The second is never a parameter here - it is
-- maintained by refresh_sold_out() and would be overwritten by the next stock
-- movement anyway, so letting anyone set it by hand would only ever produce a
-- menu that disagreed with the inventory.
--
-- REMOVING AN ITEM
-- order_items references both menu_items and menu_item_sizes ON DELETE
-- RESTRICT, so anything that has ever been ordered cannot be deleted - the
-- database refuses in order to keep order history honest. Rather than dress
-- that up, admin_delete_menu_item() says so plainly and the Admin retires the
-- item instead (is_active = false), which is what "remove from the menu"
-- actually means for a shop that has already sold it.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- READ: everything, including what customers cannot see
-- ---------------------------------------------------------------------------

create or replace function public.admin_menu_items()
returns table (
  id           uuid,
  name         text,
  description  text,
  image_url    text,
  category     text,
  badge        text,
  sort_order   int,
  is_active    boolean,
  is_sold_out  boolean,
  out_of_stock boolean,
  order_count  bigint,
  sizes        jsonb
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  return query
    select mi.id,
           mi.name,
           mi.description,
           mi.image_url,
           mi.category,
           mi.badge,
           mi.sort_order,
           mi.is_active,
           mi.is_sold_out,
           mi.out_of_stock,
           -- Tells the UI, before the Admin clicks, whether this can be
           -- deleted or only retired. Cheaper than offering a button that is
           -- going to fail.
           (select count(*) from public.order_items oi where oi.menu_item_id = mi.id),
           coalesce(
             (select jsonb_agg(jsonb_build_object(
                       'id', s.id, 'size', s.size, 'price', s.price,
                       'serves', s.serves, 'sort_order', s.sort_order,
                       'order_count', (select count(*) from public.order_items oi
                                        where oi.menu_item_size_id = s.id))
                       order by s.sort_order, s.size)
                from public.menu_item_sizes s
               where s.menu_item_id = mi.id),
             '[]'::jsonb)
      from public.menu_items mi
     order by mi.sort_order, mi.name;
end $$;

-- ---------------------------------------------------------------------------
-- WRITE: items
-- ---------------------------------------------------------------------------

create or replace function public.admin_save_menu_item(
  p_id          uuid,
  p_name        text,
  p_description text,
  p_image_url   text,
  p_category    text,
  p_badge       text,
  p_sort_order  int,
  p_is_active   boolean,
  p_is_sold_out boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Mirrored by src/config/menuAdmin.js.
  c_max_name  constant int := 80;
  c_max_desc  constant int := 300;
  c_max_short constant int := 40;
  v_name text := nullif(btrim(p_name), '');
  v_id   uuid;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  if v_name is null then
    raise exception 'name_required';
  end if;
  if char_length(v_name) > c_max_name then
    raise exception 'name_too_long';
  end if;
  if p_description is not null and char_length(p_description) > c_max_desc then
    raise exception 'description_too_long';
  end if;
  if p_category is not null and char_length(p_category) > c_max_short then
    raise exception 'category_too_long';
  end if;
  if p_badge is not null and char_length(p_badge) > c_max_short then
    raise exception 'badge_too_long';
  end if;

  if p_id is null then
    insert into public.menu_items
      (name, description, image_url, category, badge, sort_order, is_active, is_sold_out)
    values
      (v_name, nullif(btrim(p_description), ''), nullif(btrim(p_image_url), ''),
       nullif(btrim(p_category), ''), nullif(btrim(p_badge), ''),
       coalesce(p_sort_order, 0), coalesce(p_is_active, true), coalesce(p_is_sold_out, false))
    returning id into v_id;
  else
    update public.menu_items
       set name        = v_name,
           description = nullif(btrim(p_description), ''),
           image_url   = nullif(btrim(p_image_url), ''),
           category    = nullif(btrim(p_category), ''),
           badge       = nullif(btrim(p_badge), ''),
           sort_order  = coalesce(p_sort_order, sort_order),
           is_active   = coalesce(p_is_active, is_active),
           is_sold_out = coalesce(p_is_sold_out, is_sold_out)
           -- out_of_stock is deliberately absent. See the header.
     where id = p_id
    returning id into v_id;

    if not found then
      raise exception 'item_not_found';
    end if;
  end if;

  return v_id;
end $$;

create or replace function public.admin_delete_menu_item(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orders bigint;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  select count(*) into v_orders from public.order_items where menu_item_id = p_id;

  -- Checked up front rather than letting the FK fire, so the Admin gets a
  -- sentence they can act on instead of a constraint name.
  if v_orders > 0 then
    raise exception 'item_has_orders';
  end if;

  delete from public.menu_items where id = p_id;

  if not found then
    raise exception 'item_not_found';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- WRITE: sizes and prices
-- ---------------------------------------------------------------------------

create or replace function public.admin_save_menu_size(
  p_id           uuid,
  p_menu_item_id uuid,
  p_size         text,
  p_price        numeric,
  p_serves       text,
  p_sort_order   int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_short constant int     := 40;
  c_max_price constant numeric := 100000;
  v_size text := nullif(btrim(p_size), '');
  v_id   uuid;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  if v_size is null then
    raise exception 'size_required';
  end if;
  if char_length(v_size) > c_max_short then
    raise exception 'size_too_long';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'invalid_price';
  end if;
  if p_price > c_max_price then
    raise exception 'price_too_large';
  end if;

  if p_id is null then
    if p_menu_item_id is null then
      raise exception 'item_required';
    end if;
    if not exists (select 1 from public.menu_items where id = p_menu_item_id) then
      raise exception 'item_not_found';
    end if;

    insert into public.menu_item_sizes (menu_item_id, size, price, serves, sort_order)
    values (p_menu_item_id, v_size, p_price, nullif(btrim(p_serves), ''), coalesce(p_sort_order, 0))
    returning id into v_id;
  else
    update public.menu_item_sizes
       set size       = v_size,
           price      = p_price,
           serves     = nullif(btrim(p_serves), ''),
           sort_order = coalesce(p_sort_order, sort_order)
     where id = p_id
    returning id into v_id;

    if not found then
      raise exception 'size_not_found';
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    -- (menu_item_id, size) is unique: two "Medium" rows on one pizza would
    -- give the customer two identical buttons at different prices.
    raise exception 'size_already_exists';
end $$;

-- Adding a parameter creates a SECOND function rather than replacing the first:
-- (uuid) and (uuid, boolean) are different signatures to Postgres. Without this
-- drop, the original ungated version would still be sitting there, still
-- granted to authenticated, and still deleting recipes without asking — a fix
-- that leaves the hole open next to it.
drop function if exists public.admin_delete_menu_size(uuid);

create or replace function public.admin_delete_menu_size(
  p_id            uuid,
  -- Deleting a size takes its recipe with it, and there is no screen anywhere
  -- that can put a recipe back. So the caller has to say, in as many words,
  -- that it knows. A client that simply forgets gets 'size_has_recipe' rather
  -- than a silent hole in the inventory engine.
  p_confirm_recipe_loss boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orders  bigint;
  v_recipes bigint;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  select count(*) into v_orders from public.order_items where menu_item_size_id = p_id;

  if v_orders > 0 then
    raise exception 'size_has_orders';
  end if;

  -- recipes.menu_item_size_id is ON DELETE CASCADE, so the rows behind this
  -- size go the moment it does — quietly, and with no way back short of
  -- hand-written SQL. This audit removed one by accident inside a minute of
  -- probing and it cost a repair script to undo, which is why the check is
  -- here and not in a comment asking people to be careful.
  select count(*) into v_recipes from public.recipes where menu_item_size_id = p_id;

  if v_recipes > 0 and not coalesce(p_confirm_recipe_loss, false) then
    raise exception 'size_has_recipe';
  end if;

  delete from public.menu_item_sizes where id = p_id;

  if not found then
    raise exception 'size_not_found';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ACCESS
-- ---------------------------------------------------------------------------

revoke execute on function public.admin_menu_items()                              from public;
revoke execute on function public.admin_save_menu_item(uuid, text, text, text, text, text, int, boolean, boolean) from public;
revoke execute on function public.admin_delete_menu_item(uuid)                    from public;
revoke execute on function public.admin_save_menu_size(uuid, uuid, text, numeric, text, int) from public;
revoke execute on function public.admin_delete_menu_size(uuid, boolean)           from public;

grant execute on function public.admin_menu_items()                               to authenticated;
grant execute on function public.admin_save_menu_item(uuid, text, text, text, text, text, int, boolean, boolean) to authenticated;
grant execute on function public.admin_delete_menu_item(uuid)                     to authenticated;
grant execute on function public.admin_save_menu_size(uuid, uuid, text, numeric, text, int) to authenticated;
grant execute on function public.admin_delete_menu_size(uuid, boolean)                     to authenticated;
