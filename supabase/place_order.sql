-- Forno Pizza — placing an order.
--
-- WHY THIS FUNCTION EXISTS
-- Part 2's engineering standards require the order total to be recomputed
-- server-side on submit, and every checkout field to be validated server-side
-- rather than only in the form. Neither is possible while the browser inserts
-- into `orders` directly: whatever it sends for `total` is what gets stored.
--
-- So placing an order is a single SECURITY DEFINER call. The browser sends only
-- WHAT was ordered (size ids, quantities, topping ids) and WHO it is for. Every
-- number that touches money is read from the database here:
--   * unit prices   <- menu_item_sizes.price
--   * extras        <- toppings.price
--   * delivery fee  <- shop_settings.delivery_fee
--   * line totals and the order total are derived, never accepted.
--
-- Part 3 added one more thing it does: the ingredients the order consumes come
-- out of stock here too, in the same transaction, so an order that cannot be
-- made is never confirmed.
--
-- RUN ORDER: schema.sql, seed_menu.sql, shop_settings.sql, toppings.sql,
-- seed_recipes.sql, recipes.sql, deduct_stock.sql, then this file. It supersedes
-- get_order_by_token() from schema.sql, which predates toppings, and it calls
-- deduct_order_stock(), so both of those have to exist first. Safe to re-run.

-- ---------------------------------------------------------------------------
-- READING AN ORDER BACK
-- Supersedes the version in schema.sql: same contract, with each line's chosen
-- extras attached.
-- ---------------------------------------------------------------------------

-- Shared by both readers, so the shape of a line's extras is defined once.
-- Declared before get_order_by_token because Postgres validates a SQL function
-- body at CREATE time — the other order fails with "function does not exist".
create or replace function public.order_item_toppings_json(p_order_item_id uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object('id', ot.topping_id, 'name', ot.name, 'price', ot.price)
                     order by ot.price desc, ot.name)
    from public.order_item_toppings ot
    where ot.order_item_id = p_order_item_id
  ), '[]'::jsonb);
$$;


-- `stock_deducted` is stripped alongside the token: it is the inventory
-- engine's own bookkeeping and no business of the customer's.
create or replace function public.get_order_by_token(p_access_token uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'order', to_jsonb(o) - 'access_token' - 'stock_deducted',
    'items', coalesce((
      select jsonb_agg(
        to_jsonb(oi) || jsonb_build_object('toppings', public.order_item_toppings_json(oi.id))
        order by oi.created_at
      )
      from public.order_items oi where oi.order_id = o.id
    ), '[]'::jsonb),
    'status_history', coalesce((
      select jsonb_agg(jsonb_build_object('status', h.status, 'created_at', h.created_at) order by h.created_at)
      from public.order_status_history h where h.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  where o.access_token = p_access_token
    -- A tracking link is a bearer credential: whoever holds it reads the
    -- customer's name, phone number and home address. Without this line it
    -- does that for ever, so a link forwarded into a family group chat in
    -- January is still an open window onto that address in December.
    --
    -- Thirty days is well past the life of a pizza order and past any
    -- realistic "where was that place again?" — cancelling closes in minutes
    -- and tracking is over in an hour. A signed-in customer is unaffected:
    -- /orders reads through RLS on user_id, not through this token.
    and o.created_at > now() - interval '30 days';
$$;


-- ---------------------------------------------------------------------------
-- PLACING AN ORDER
-- ---------------------------------------------------------------------------

create or replace function public.place_order(
  p_fulfillment_type text,
  p_customer_name    text,
  p_customer_phone   text,
  p_delivery_address text,
  p_delivery_notes   text,
  p_items            jsonb   -- [{ "size_id": uuid, "quantity": 2, "topping_ids": [uuid, ...] }]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name     text    := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_phone    text    := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  v_address  text    := nullif(btrim(coalesce(p_delivery_address, '')), '');
  v_notes    text    := nullif(btrim(coalesce(p_delivery_notes, '')), '');
  v_delivery boolean;
  v_recent   int;
  v_subtotal numeric(10,2);
  v_fee      numeric(10,2);
  v_order    public.orders;
  v_line     record;
  v_size     record;
  v_extras   numeric(10,2);
  v_matched  int;
  v_wanted   int;
  v_item_id  uuid;
  v_line_id  uuid;
  v_written  int := 0;
begin
  -- -------------------------------------------------------------------------
  -- FIELD VALIDATION
  -- Deliberately a mirror of src/lib/validation.js. The form version exists to
  -- give fast, friendly feedback; this version is the one that actually decides,
  -- because anything can POST to the API without ever loading the form.
  -- tests/validation-parity.test.js proves the two stay in step.
  -- -------------------------------------------------------------------------

  if p_fulfillment_type is null or p_fulfillment_type not in ('delivery', 'pickup') then
    raise exception 'invalid_fulfillment_type';
  end if;
  v_delivery := (p_fulfillment_type = 'delivery');

  if v_name is null or char_length(v_name) < 2 then
    raise exception 'invalid_name';
  end if;
  -- Refused, not trimmed. left(v_name, 80) silently handed the kitchen a
  -- different name from the one the customer typed, with nothing on screen to
  -- say so — and the over-long notes field two checks below already raises
  -- rather than trimming, so the two disagreed about the same kind of mistake.
  if char_length(v_name) > 80 then
    raise exception 'name_too_long';
  end if;

  -- Pakistani mobile: 10 digits starting with 3, written locally as 0300...,
  -- internationally as +92 300.... Stored in one canonical form so the kitchen
  -- and Part 3's tracker never see the same customer two different ways.
  if v_phone ~ '^0?3\d{9}$' then
    v_phone := '+92' || right(v_phone, 10);
  elsif v_phone ~ '^923\d{9}$' then
    v_phone := '+' || v_phone;
  else
    raise exception 'invalid_phone';
  end if;

  if v_delivery then
    if v_address is null or char_length(v_address) < 8 then
      raise exception 'invalid_address';
    end if;
    -- Same reasoning as the name above: a quietly truncated address is a
    -- delivery the rider cannot complete.
    if char_length(v_address) > 300 then
      raise exception 'address_too_long';
    end if;
  else
    -- A pickup order has nowhere to deliver to; drop anything sent anyway.
    v_address := null;
  end if;

  if v_notes is not null and char_length(v_notes) > 200 then
    raise exception 'invalid_notes';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart';
  end if;

  if jsonb_array_length(p_items) > 40 then
    raise exception 'too_many_lines';
  end if;

  -- -------------------------------------------------------------------------
  -- RATE LIMIT
  -- Enough to stop a jammed button or a trivial script from filling the
  -- kitchen's queue. No real customer places five orders in two minutes.
  -- -------------------------------------------------------------------------

  select count(*) into v_recent
  from public.orders o
  where o.customer_phone = v_phone
    and o.created_at > now() - interval '2 minutes';

  if v_recent >= 5 then
    raise exception 'rate_limited';
  end if;

  -- -------------------------------------------------------------------------
  -- THE ORDER
  -- user_id comes from the verified JWT, never from the request body, so a
  -- guest order is simply one placed without a session.
  -- -------------------------------------------------------------------------

  insert into public.orders (
    user_id, customer_name, customer_phone,
    fulfillment_type, delivery_address, delivery_notes,
    status, subtotal, delivery_fee, tax, total
  ) values (
    auth.uid(), v_name, v_phone,
    p_fulfillment_type, v_address, v_notes,
    'placed', 0, 0, 0, 0
  )
  returning * into v_order;

  -- -------------------------------------------------------------------------
  -- THE LINES, PRICED FROM THE DATABASE
  --
  -- Lines are grouped by size AND topping set: a Large with extra cheese and a
  -- plain Large are different products, but sending the same combination twice
  -- must still collapse, or the per-line quantity cap could be walked past by
  -- repeating a line.
  -- -------------------------------------------------------------------------

  for v_line in
    with requested as (
      select
        (elem ->> 'size_id')::uuid as size_id,
        (elem ->> 'quantity')::int as quantity,
        coalesce((
          select array_agg(distinct chosen.id::uuid order by chosen.id::uuid)
          from jsonb_array_elements_text(
                 case when jsonb_typeof(elem -> 'topping_ids') = 'array'
                      then elem -> 'topping_ids' else '[]'::jsonb end
               ) as chosen(id)
        ), '{}'::uuid[]) as topping_ids
      from jsonb_array_elements(p_items) as elem
    )
    select size_id, topping_ids, sum(quantity)::int as quantity
    from requested
    group by size_id, topping_ids
  loop
    if v_line.quantity is null or v_line.quantity < 1 or v_line.quantity > 20 then
      raise exception 'item_unavailable';
    end if;

    if coalesce(array_length(v_line.topping_ids, 1), 0) > 10 then
      raise exception 'too_many_toppings';
    end if;

    select ms.id as size_id, ms.price, ms.size, mi.id as item_id, mi.name
      into v_size
    from public.menu_item_sizes ms
    join public.menu_items mi on mi.id = ms.menu_item_id
    where ms.id = v_line.size_id
      and mi.is_active
      and not mi.is_sold_out
      and not mi.out_of_stock;

    -- Covers an unknown size, an item pulled by hand, an item the engine has
    -- flagged as having no ingredients left, and a line with no size_id at all
    -- — none of which may quietly become an order with missing food on it.
    if not found then
      raise exception 'item_unavailable';
    end if;

    v_item_id := v_size.item_id;
    v_wanted := coalesce(array_length(v_line.topping_ids, 1), 0);

    -- Every requested extra must be active AND offered by this particular item,
    -- so pizza toppings cannot be attached to a burger, and a retired topping
    -- cannot be resurrected by id.
    select coalesce(sum(t.price), 0), count(*)
      into v_extras, v_matched
    from public.toppings t
    join public.menu_item_toppings mit
      on mit.topping_id = t.id and mit.menu_item_id = v_item_id
    where t.id = any(v_line.topping_ids)
      and t.is_active;

    if v_matched <> v_wanted then
      raise exception 'topping_unavailable';
    end if;

    -- unit_price carries the extras, so line_total = unit_price * quantity
    -- still holds and the receipt adds up line by line.
    insert into public.order_items (
      order_id, menu_item_id, menu_item_size_id,
      item_name, size_label, quantity, unit_price, line_total
    ) values (
      v_order.id, v_item_id, v_size.size_id,
      v_size.name, v_size.size, v_line.quantity,
      v_size.price + v_extras,
      (v_size.price + v_extras) * v_line.quantity
    )
    returning id into v_line_id;

    -- Snapshot the extras against the line just written.
    insert into public.order_item_toppings (order_item_id, topping_id, name, price)
    select v_line_id, t.id, t.name, t.price
    from public.toppings t
    where t.id = any(v_line.topping_ids);

    v_written := v_written + 1;
  end loop;

  if v_written = 0 then
    raise exception 'item_unavailable';
  end if;

  -- -------------------------------------------------------------------------
  -- THE MONEY
  -- Summed from the rows just written, so the order total can never drift away
  -- from its own line items.
  -- -------------------------------------------------------------------------

  select coalesce(sum(oi.line_total), 0) into v_subtotal
  from public.order_items oi
  where oi.order_id = v_order.id;

  select s.delivery_fee into v_fee
  from public.shop_settings s
  where s.id = 1;

  if v_fee is null then
    raise exception 'settings_missing';
  end if;

  if not v_delivery then
    v_fee := 0;
  end if;

  -- Menu prices are tax-inclusive, so tax stays 0 and the column is kept for
  -- the day that changes.
  update public.orders
     set subtotal     = v_subtotal,
         delivery_fee = v_fee,
         tax          = 0,
         total        = v_subtotal + v_fee
   where id = v_order.id
  returning * into v_order;

  -- -------------------------------------------------------------------------
  -- THE STOCK
  --
  -- Last, on purpose. Every ingredient this order needs is locked here and the
  -- locks are held until the transaction commits, so the less that happens
  -- afterwards the less time two orders for the same shelf spend queued behind
  -- each other. Everything above this point — validation, pricing, the rate
  -- limit — can fail without ever having touched a lock.
  --
  -- Same transaction, so a shortage unwinds the order rather than confirming an
  -- order the kitchen cannot make. That is Part 3's "an order should never
  -- confirm if the stock update fails", and it costs one line because plpgsql
  -- already works that way.
  -- -------------------------------------------------------------------------

  perform public.deduct_order_stock(v_order.id);

  -- Same shape as get_order_by_token(), so one client-side reader handles both.
  -- access_token is returned exactly once, here, to whoever just placed the
  -- order — it is never included in any later read.
  return jsonb_build_object(
    'access_token', v_order.access_token,
    -- Stripped for two reasons: it is internal bookkeeping, and here it would
    -- also be STALE — v_order was captured before deduct_order_stock() ran, so
    -- it still says false about something that has just happened. A field that
    -- lies is worse than a field that is absent.
    'order', to_jsonb(v_order) - 'access_token' - 'stock_deducted',
    'items', coalesce((
      select jsonb_agg(
        to_jsonb(oi) || jsonb_build_object('toppings', public.order_item_toppings_json(oi.id))
        order by oi.created_at
      )
      from public.order_items oi where oi.order_id = v_order.id
    ), '[]'::jsonb),
    'status_history', coalesce((
      select jsonb_agg(jsonb_build_object('status', h.status, 'created_at', h.created_at)
                       order by h.created_at)
      from public.order_status_history h where h.order_id = v_order.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC by default, so these
-- grants were decorating a door that was already open. Revoking first makes the
-- audience explicit: anon and authenticated, and nobody else. Nothing changes
-- for a real caller today — what changes is that a role added later inherits
-- nothing by accident.
revoke execute on function
  public.place_order(text, text, text, text, text, jsonb) from public;
revoke execute on function public.get_order_by_token(uuid)         from public;

grant execute on function
  public.place_order(text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.get_order_by_token(uuid)          to anon, authenticated;
-- Deliberately NOT granted to anon/authenticated: it is SECURITY DEFINER, so a
-- direct call with a guessed order_item id would read that line's extras
-- without the access token. get_order_by_token() runs as the owner and reaches
-- it regardless.
revoke execute on function public.order_item_toppings_json(uuid) from public;

-- ---------------------------------------------------------------------------
-- CLOSING THE OLD PATH
--
-- Part 1 let the client INSERT into orders and order_items directly. That was
-- correct for Part 1 — there was no pricing logic yet — but it is exactly the
-- hole place_order() exists to close: a direct insert sets its own total.
-- Revoked at both layers, privileges and policy, so neither alone is load-
-- bearing. schema.sql no longer grants them either, so re-running it is safe.
-- ---------------------------------------------------------------------------

drop policy if exists orders_insert      on public.orders;
drop policy if exists order_items_insert on public.order_items;

revoke insert on public.orders      from anon, authenticated;
revoke insert on public.order_items from anon, authenticated;

-- Only place_order() consumes the sequence now, and it runs as the owner.
revoke usage on sequence public.order_number_seq from anon, authenticated;
