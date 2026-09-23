-- ---------------------------------------------------------------------------
-- Forno Pizza — the Admin's view of real orders.
--
-- RUN ORDER: after schema.sql, place_order.sql, active_orders.sql and
-- staff_roles.sql. Safe to re-run.
--
-- WHAT WAS MISSING
-- admin_active_orders() answers "how busy are we" with a count per stage. It
-- cannot answer "what is in order #1007", because it groups the orders away
-- before they ever leave Postgres. The only per-order reader in the database
-- is get_order_by_token(), and that deliberately takes the customer's secret
-- token — staff do not hold one and must never need to.
--
-- So two functions here: a list to scan, and one order in full.
--
-- WHY A FUNCTION AND NOT A POLICY ON orders
-- Every staff read in Part 4 goes through a SECURITY DEFINER function rather
-- than an RLS policy, and these follow that. `orders` carries access_token,
-- which IS the customer's credential: opening the table to a client role would
-- expose every column it has now and every column it ever gains, and the
-- protection would be a SELECT list somebody has to remember to keep right.
-- A function exposes what it names and nothing else.
--
-- ADMIN ONLY
-- Not is_manager(). admin_active_orders() lets both roles see a count of open
-- orders because a count tells you nothing about a person; this returns names,
-- phone numbers and delivery addresses. The Manager's job — stock against
-- sales — is already served by sales_report() without reading anyone's
-- address. Least privilege, and the narrower rule is the one that needs no
-- justification later.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- THE LIST
--
-- Everything, newest first, not just what is open: "see the actual orders"
-- includes the one that was delivered an hour ago and the one that was
-- cancelled. Filtering by stage is the screen's job, and it has is_active
-- below to do it with rather than a second opinion about which statuses are
-- finished.
--
-- p_limit caps it because a list is for scanning. A shop doing fifty orders a
-- day fills the default in two days, and anything older is a reporting
-- question, which sales_report() already answers. Mirrored by
-- ADMIN_ORDERS_LIMIT in src/config/adminOrders.js.
--
-- AN OPEN ORDER IS NEVER CAPPED OUT
-- The cap applies to FINISHED orders only. A plain "newest N" hid six open
-- orders behind ninety-seven cancelled ones: the sidebar badge said nine were
-- in progress, the list could only show three, and the other six could not be
-- reached from this screen at all. That is the exact order that most needs
-- finding — one the kitchen forgot to close, now buried by a busy day.
--
-- So the rule is: every order still in progress, plus the newest p_limit of
-- everything. The badge counts open orders across the whole table, and this
-- now contains all of them, so the two cannot disagree.
-- ---------------------------------------------------------------------------

create or replace function public.admin_orders(p_limit int default 100)
returns table (
  id               uuid,
  order_number     text,
  status           text,
  fulfillment_type text,
  customer_name    text,
  -- Whether the order is tied to an account, NOT who that account is. The list
  -- shows a badge; only admin_order_detail() below hands over an email.
  has_account      boolean,
  -- Units, not lines. "3 items" to a person means three pizzas, not three rows
  -- that might each be a quantity of four.
  item_count       bigint,
  total            numeric,
  created_at       timestamptz,
  is_active        boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  -- Matches MAX_ADMIN_ORDERS in src/config/adminOrders.js.
  c_max_limit constant int := 500;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  if p_limit is null or p_limit <= 0 or p_limit > c_max_limit then
    raise exception 'invalid_limit';
  end if;

  return query
    select o.id,
           o.order_number,
           o.status,
           o.fulfillment_type,
           o.customer_name,
           o.user_id is not null,
           coalesce((
             select sum(oi.quantity)::bigint
             from public.order_items oi
             where oi.order_id = o.id
           ), 0),
           o.total,
           o.created_at,
           public.order_is_active(o.status, o.fulfillment_type)
      from public.orders o
     where public.order_is_active(o.status, o.fulfillment_type)
        -- The newest p_limit of everything, open or finished. An open order
        -- already matched above, so this only adds finished ones.
        or o.id in (
             select r.id from public.orders r
              order by r.created_at desc
              limit p_limit
           )
     order by o.created_at desc;
end $$;

comment on function public.admin_orders(int) is
  'Recent orders for the Admin panel, newest first: every order still in '
  'progress, plus the newest p_limit of everything. One row per order with a '
  'unit count and whether it belongs to an account. No customer contact '
  'details — those are in admin_order_detail().';


-- ---------------------------------------------------------------------------
-- ONE ORDER IN FULL
--
-- Same shape as get_order_by_token() — order, items, status_history — so the
-- browser normalises both with one function instead of two that can disagree.
-- Two things differ, and both are deliberate:
--
--   access_token is stripped, exactly as the customer's own reader strips it.
--   Staff never need it, and it is the one value that would let anyone cancel
--   a stranger's order. stock_deducted goes too: it is engine bookkeeping.
--
--   `account` is added. Every order carries customer_name and customer_phone
--   because checkout requires them of guests too — that is how the food gets
--   delivered. What is genuinely optional is the ACCOUNT, and this is the only
--   place an email address appears.
-- ---------------------------------------------------------------------------

create or replace function public.admin_order_detail(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_order  public.orders;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  select * into v_order from public.orders where id = p_order_id;

  if not found then
    raise exception 'order_not_found';
  end if;

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
      select jsonb_agg(
        jsonb_build_object('status', h.status, 'created_at', h.created_at)
        order by h.created_at
      )
      from public.order_status_history h where h.order_id = o.id
    ), '[]'::jsonb),

    -- Null for a guest, and the screen says "Guest checkout" rather than
    -- showing an empty row. order_count includes this order, so a first-time
    -- customer reads "1 order" rather than "0".
    --
    -- Only the email is taken from auth.users. That table holds password
    -- hashes, recovery tokens and provider metadata, and a SECURITY DEFINER
    -- function can read all of it — so it names the one column it needs.
    'account', case
      when o.user_id is null then null
      else jsonb_build_object(
        'email', (select u.email from auth.users u where u.id = o.user_id),
        'order_count', (select count(*) from public.orders p where p.user_id = o.user_id)
      )
    end
  )
  into v_result
  from public.orders o
  where o.id = p_order_id;

  return v_result;
end $$;

comment on function public.admin_order_detail(uuid) is
  'One order in full for the Admin panel: lines, extras, status trail, and the '
  'account behind it when there is one. access_token is never included.';


-- ---------------------------------------------------------------------------
-- ACCESS
--
-- Postgres grants EXECUTE to PUBLIC on a new function, which for a SECURITY
-- DEFINER function reading every order in the shop would mean every anonymous
-- visitor. Revoke first, then open to signed-in users — where is_admin()
-- inside each function is what actually decides.
-- ---------------------------------------------------------------------------

revoke execute on function public.admin_orders(int)        from public;
revoke execute on function public.admin_order_detail(uuid) from public;

grant execute on function public.admin_orders(int)        to authenticated;
grant execute on function public.admin_order_detail(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- LOOKING BY HAND
--
--   select * from public.admin_orders(20);
--   select public.admin_order_detail(
--     (select id from public.orders where order_number = '1007'));
-- ---------------------------------------------------------------------------
