-- Forno Pizza — moving an order through its four stages.
--
-- RUN ORDER: after schema.sql, place_order.sql and deduct_stock.sql.
-- Safe to re-run.
-- (cancel_order() hands its result back through get_order_by_token(), and the
--  version of that in place_order.sql is the one that includes each line's
--  extras.)
--
-- The status column and the order_status_history trigger already exist from
-- Part 1. What was missing is a *controlled* way to change the status: a plain
-- UPDATE can set anything the check constraint allows, including walking an
-- order backwards from 'delivered' to 'placed', or pulling a cancelled order
-- back into the kitchen.
--
-- No customer-side role can execute either function here. Advancing an order is
-- the kitchen's action, and the kitchen has no screen until Part 4 — until then
-- these are run from the Supabase SQL editor to move a test order along. Part 4
-- grants execute to the Manager role and calls this same function, so none of
-- this gets rewritten later.

-- ---------------------------------------------------------------------------
-- THE LADDER
-- Mirrors STATUS_FLOW in src/config/orderStatus.js. Kept in SQL as well as JS
-- because the browser cannot enforce a sequence and Postgres cannot import a
-- module; tests/order-status.test.js is what holds the two in step.
-- ---------------------------------------------------------------------------

create or replace function public.order_status_flow(p_fulfillment_type text)
returns text[] language sql immutable as $$
  select case p_fulfillment_type
    when 'delivery' then array['placed', 'preparing', 'out_for_delivery', 'delivered']
    when 'pickup'   then array['placed', 'preparing', 'ready_for_pickup', 'picked_up']
  end;
$$;

-- ---------------------------------------------------------------------------
-- WHAT THE DATABASE ACTUALLY ALLOWS
--
-- Reads the status values straight out of the check constraint on orders.
-- The list is not a secret — every one of these words is printed on a customer's
-- own tracking page — and having the database state its own vocabulary is what
-- lets tests/order-status.test.js prove ORDER_STATUS in JavaScript has not
-- drifted from the constraint that will actually reject a bad write. Part 4's
-- Manager panel can drive its status control from this rather than retyping the
-- list a fourth time.
-- ---------------------------------------------------------------------------

create or replace function public.order_status_values()
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(array_agg(distinct v order by v), '{}'::text[])
  from pg_constraint c
  join pg_attribute a
    on a.attrelid = c.conrelid
   and a.attnum = any (c.conkey)
   and a.attname = 'status',
  lateral regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') as m(captures),
  lateral unnest(m.captures) as v
  where c.conrelid = 'public.orders'::regclass
    and c.contype = 'c';
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC by default, so these
-- grants were decorating a door that was already open. Revoking first makes the
-- audience explicit: anon and authenticated, and nobody else. Nothing changes
-- for a real caller today — what changes is that a role added later inherits
-- nothing by accident.
revoke execute on function public.order_status_values() from public;

grant execute on function public.order_status_values() to anon, authenticated;


-- ---------------------------------------------------------------------------
-- SETTING A STATUS
-- ---------------------------------------------------------------------------

create or replace function public.set_order_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order   public.orders;
  v_flow    text[];
  v_from    int;
  v_to      int;
begin
  -- Lock the row for the rest of the transaction. Two staff members hitting
  -- "out for delivery" at once would otherwise both read 'preparing' and both
  -- write, logging the same stage twice in order_status_history.
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'order_cancelled';
  end if;

  v_flow := public.order_status_flow(v_order.fulfillment_type);
  v_from := array_position(v_flow, v_order.status);
  v_to   := array_position(v_flow, p_status);

  -- A pickup order can never be 'out_for_delivery', and vice versa: the target
  -- has to be on *this* order's ladder, not merely a legal status somewhere.
  if v_to is null then
    raise exception 'invalid_status';
  end if;

  -- Forward only. Skipping ahead is allowed — a busy kitchen genuinely does
  -- forget to press "preparing" — but an order never un-delivers itself.
  if v_from is not null and v_to <= v_from then
    raise exception 'status_not_forward';
  end if;

  update public.orders set status = p_status where id = p_order_id
  returning * into v_order;

  return jsonb_build_object(
    'order_number', v_order.order_number,
    'status', v_order.status
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- ONE STAGE ALONG
-- The testing convenience, and what a "mark as next stage" button in Part 4
-- would call. Takes the order number because that is what is printed on the
-- ticket and shown on the customer's screen.
-- ---------------------------------------------------------------------------

create or replace function public.advance_order_status(p_order_number text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_type   text;
  v_status text;
  v_flow   text[];
  v_at     int;
begin
  select id, fulfillment_type, status into v_id, v_type, v_status
  from public.orders
  where order_number = p_order_number;

  if v_id is null then
    raise exception 'order_not_found';
  end if;

  if v_status = 'cancelled' then
    raise exception 'order_cancelled';
  end if;

  v_flow := public.order_status_flow(v_type);
  v_at := array_position(v_flow, v_status);

  if v_at is null or v_at >= array_length(v_flow, 1) then
    raise exception 'already_final';
  end if;

  return public.set_order_status(v_id, v_flow[v_at + 1]);
end;
$$;

-- ---------------------------------------------------------------------------
-- CANCELLING
--
-- The customer's own action, and the only status change they are allowed to
-- make — which is why this one IS granted to anon and authenticated while
-- set_order_status() is not.
--
-- It takes the access token rather than the order id, deliberately. Part 3's
-- security standard is that a customer may only cancel their own order and that
-- an order id alone must never be trusted. Ids travel in URLs, payloads and
-- logs; the token does not, and it is already the credential that
-- get_order_by_token() accepts. Using anything else here would mean inventing a
-- second, weaker idea of ownership alongside the one that already works for
-- guests and account holders alike.
-- ---------------------------------------------------------------------------

create or replace function public.cancel_order(p_access_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  -- Locked for the rest of the transaction. A customer tapping "cancel" at the
  -- same moment the kitchen presses "preparing" has to resolve one way or the
  -- other: whichever reaches the row first wins, and the second reads the
  -- status the first wrote rather than its own stale copy.
  select * into v_order
  from public.orders
  where access_token = p_access_token
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'already_cancelled';
  end if;

  -- The window: before the kitchen starts. Once there is dough on the bench the
  -- cost is already spent, which is why the line is drawn at a stage rather
  -- than at a clock — a shop that is running twenty minutes behind should not
  -- be refusing cancellations for pizzas it has not begun.
  if v_order.status <> 'placed' then
    raise exception 'cancel_window_closed';
  end if;

  update public.orders set status = 'cancelled' where id = v_order.id;

  -- The ingredients came out of stock when the order was placed. Nothing has
  -- been cooked — cancelling is only possible before the kitchen starts — so
  -- they go back, in the same transaction as the cancellation itself. Without
  -- this, every cancelled order would permanently eat food nobody ate.
  perform public.restore_order_stock(v_order.id);

  -- Same shape the tracking page already renders, so cancelling re-uses the
  -- one reader rather than needing a second fetch to see its own result.
  return public.get_order_by_token(p_access_token);
end;
$$;


-- ---------------------------------------------------------------------------
-- ACCESS
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, which for a
-- SECURITY DEFINER function means every anonymous visitor. Revoking is the
-- whole point of this block — without it, anyone could mark their own order
-- delivered. Part 4 adds `grant execute ... to authenticated` behind a Manager
-- role check.
-- ---------------------------------------------------------------------------

revoke execute on function public.set_order_status(uuid, text)     from public;
revoke execute on function public.advance_order_status(text)       from public;
revoke execute on function public.order_status_flow(text)          from public;

-- The exception: cancelling is the customer's to do, within the window the
-- function itself enforces.
revoke execute on function public.cancel_order(uuid) from public;
grant execute on function public.cancel_order(uuid) to anon, authenticated;

-- Customers must not be able to write a status by hand either. There is no
-- UPDATE policy on orders, but the grant is the layer Postgres checks first.
revoke update on public.orders from anon, authenticated;


-- ---------------------------------------------------------------------------
-- MOVING A TEST ORDER ALONG
--
-- Paste one of these into the SQL editor with your own order number. Run the
-- first repeatedly and watch the tracking page climb:
--
--   select public.advance_order_status('1306');
--
-- Or jump straight to a stage:
--
--   select public.set_order_status(
--     (select id from public.orders where order_number = '1306'),
--     'out_for_delivery'
--   );
-- ---------------------------------------------------------------------------
