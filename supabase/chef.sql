-- ---------------------------------------------------------------------------
-- Forno Pizza — the kitchen.
--
-- RUN ORDER: after staff_roles.sql, order_status.sql and active_orders.sql.
-- Safe to re-run. Self-contained: it adds the role, opens the two status
-- functions to it, and grants the role to an account, so this is the only file
-- to run.
--
-- NOTHING TO EDIT. The kitchen account already exists in Supabase Auth; this
-- file finds it by address and grants it the role. Paste and run.
--
-- ONE THING TO KNOW BEFORE THE SHOP GOES LIVE: the address below is a test
-- account, and this repository is public. When a real kitchen account replaces
-- it, change it here and do not commit the real address — seed_staff.sql keeps
-- placeholders for exactly that reason.
--
-- WHAT THIS CHANGES, AND WHY IT IS A CHANGE AT ALL
-- Until now NO screen in this product could move an order along.
-- set_order_status() and advance_order_status() have existed since Part 3 and
-- are revoked from every role — the comment in order_status.sql says "Part 4
-- grants execute to the Manager role", and Part 4 never did. Orders have only
-- ever been advanced by hand in the SQL editor. This file is the first time
-- the kitchen gets a button, which is why it is also the first time those two
-- functions need a role check of their own.
--
-- ONE CHEF, SHARED
-- The PRD's "single Admin, single Manager, no multi-user role management"
-- extends to the kitchen: staff_one_account_per_role stays exactly as it is,
-- and the whole kitchen signs in as one chef. That is a deliberate trade — the
-- shop gains a kitchen screen and gives up knowing which cook pressed the
-- button. order_status_history still records every change and when, just not by
-- whom.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- THE ROLE
-- ---------------------------------------------------------------------------

-- The constraint is replaced rather than altered: Postgres has no "add a value
-- to a check constraint", and a named drop-then-add is the honest way to say
-- what changed. Existing rows all satisfy the wider rule, so nothing can fail.
alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff
  add constraint staff_role_check check (role in ('manager', 'admin', 'chef'));

comment on table public.staff is
  'The single Manager, Admin and Chef. Unreachable by any client: no grant, '
  'RLS on with no policy. Read only through the SECURITY DEFINER helpers.';

create or replace function public.is_chef()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.staff s
     where s.user_id = auth.uid() and s.role = 'chef'
  );
$$;

comment on function public.is_chef() is
  'True when the caller holds the chef role. Answers only about the caller, '
  'exactly like is_manager() and is_admin().';

revoke execute on function public.is_chef() from public;
grant  execute on function public.is_chef() to authenticated;


-- ---------------------------------------------------------------------------
-- WHAT THE KITCHEN SEES
--
-- Open orders, oldest first, with what to make. The ladder decides what counts
-- as open — order_is_active() reads the terminal status off the end of
-- order_status_flow() — so a kitchen screen and the Admin's open-order count
-- can never disagree about which orders are still running.
--
-- DELIBERATELY NOT HERE: phone number and delivery address.
-- A kitchen needs to know what to cook and who to call out, not where anyone
-- lives. The Admin's order detail already carries the contact details for the
-- one person whose job that is. Least privilege applies inside the shop too,
-- and a screen left open on a counter all evening is exactly where it matters.
-- ---------------------------------------------------------------------------

create or replace function public.chef_orders()
returns table (
  id               uuid,
  order_number     text,
  status           text,
  fulfillment_type text,
  customer_name    text,
  created_at       timestamptz,
  item_count       bigint,
  items            jsonb,
  next_status      text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  -- The Admin may look at the kitchen screen; the Manager has no business
  -- there and has their own. Both is_chef() and is_admin() are checked rather
  -- than "not a customer", so adding a fourth role later does not silently
  -- admit it.
  if not (public.is_chef() or public.is_admin()) then
    raise exception 'not_kitchen';
  end if;

  return query
    select o.id,
           o.order_number,
           o.status,
           o.fulfillment_type,
           o.customer_name,
           o.created_at,
           coalesce((
             select sum(oi.quantity)::bigint
             from public.order_items oi where oi.order_id = o.id
           ), 0),
           coalesce((
             select jsonb_agg(
               jsonb_build_object(
                 'name', oi.item_name,
                 'size', oi.size_label,
                 'quantity', oi.quantity,
                 'toppings', public.order_item_toppings_json(oi.id)
               ) order by oi.created_at
             )
             from public.order_items oi where oi.order_id = o.id
           ), '[]'::jsonb),
           -- The one stage this order can move to next, computed from its own
           -- ladder. Sent rather than derived in the browser so the button can
           -- never offer a step the database would refuse: a pickup order is
           -- never "out for delivery", and neither is a finished one.
           (
             select f[array_position(f, o.status) + 1]
             from (select public.order_status_flow(o.fulfillment_type) as f) s
           )
      from public.orders o
     where public.order_is_active(o.status, o.fulfillment_type)
     -- Oldest first. The order that has been waiting longest is the one the
     -- kitchen should be looking at, which is the opposite of every other list
     -- in this product.
     order by o.created_at;
end $$;

comment on function public.chef_orders() is
  'Open orders for the kitchen screen, oldest first, with what to make and the '
  'one stage each can move to next. Carries no phone number or address.';


-- ---------------------------------------------------------------------------
-- MOVING AN ORDER ALONG
--
-- set_order_status() already refuses to go backwards, to skip onto another
-- ladder, or to touch a cancelled order. What it never had was any idea of WHO
-- was asking, because until now nobody could ask at all.
--
-- The check goes inside the function rather than being left to the grant. A
-- grant says "this role may call it"; the check says "this role may do it", and
-- the second survives someone later widening the first.
--
-- The Admin is included on purpose, and it is a judgement call worth stating:
-- with one shared chef login, a kitchen that cannot sign in is a shop that
-- cannot move a single order. The Admin already sees every order in full, so
-- refusing them the button would be a rule with nothing behind it. The Manager
-- is not included — stock and sales are their job, and the kitchen is not.
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
  if not (public.is_chef() or public.is_admin()) then
    raise exception 'not_kitchen';
  end if;

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
  -- Checked here as well as in set_order_status(). Each function is reachable
  -- on its own, so each carries its own guard rather than relying on the other
  -- one still having it.
  if not (public.is_chef() or public.is_admin()) then
    raise exception 'not_kitchen';
  end if;

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
-- ACCESS
--
-- Opened to signed-in users, where the role check inside each function is what
-- actually decides. Revoked from PUBLIC first: Postgres grants EXECUTE to
-- PUBLIC by default, which for a SECURITY DEFINER function would mean every
-- anonymous visitor could mark their own order delivered.
-- ---------------------------------------------------------------------------

revoke execute on function public.chef_orders()                from public;
revoke execute on function public.set_order_status(uuid, text) from public;
revoke execute on function public.advance_order_status(text)   from public;

grant execute on function public.chef_orders()                to authenticated;
grant execute on function public.set_order_status(uuid, text) to authenticated;
grant execute on function public.advance_order_status(text)   to authenticated;


-- ---------------------------------------------------------------------------
-- HAND THE ROLE TO AN ACCOUNT
-- ---------------------------------------------------------------------------

do $$
declare
  -- >>> PUT THE KITCHEN ADDRESS HERE BEFORE RUNNING <<<
  --
  -- It must match TEST_CHEF_EMAIL in .env, because the kitchen tests sign in
  -- as it. A placeholder on purpose, for the same reason as seed_staff.sql:
  -- this repository is public, and publishing the address the kitchen logs in
  -- with hands an attacker half a credential for nothing in return. This file
  -- previously carried the real address so it could be pasted and run without
  -- editing; the convenience was not worth the disclosure.
  v_chef_email constant text := 'REPLACE_WITH_CHEF_EMAIL';
  v_chef_id    uuid;
begin
  select id into v_chef_id from auth.users where lower(email) = lower(v_chef_email);

  if v_chef_id is null then
    raise exception
      'No auth user with email %. Create it first: Authentication -> Users -> Add user (tick Auto Confirm User).',
      v_chef_email;
  end if;

  if exists (select 1 from public.staff where user_id = v_chef_id and role <> 'chef') then
    raise exception
      'That account already holds another staff role. One account, one role.';
  end if;

  -- Same shape as seed_staff.sql: move the role rather than add a row, so
  -- re-running after changing the address does the right thing instead of
  -- tripping the one-account-per-role index.
  delete from public.staff where role = 'chef' and user_id <> v_chef_id;

  insert into public.staff (user_id, role) values (v_chef_id, 'chef')
    on conflict (user_id) do update set role = excluded.role;

  raise notice 'chef -> % (%)', v_chef_email, v_chef_id;
end $$;


-- ---------------------------------------------------------------------------
-- VERIFICATION
--
-- Structural only. Every function below is role-gated and the SQL Editor runs
-- as `postgres` with auth.uid() null, so calling one raises and rolls the file
-- back. tests/chef.test.js is what calls them, signed in as each role.
-- ---------------------------------------------------------------------------

do $$
declare
  v_fail int := 0;
  v_sig  text;
begin
  -- 1. the role is now allowed by the constraint
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.staff'::regclass
       and conname = 'staff_role_check'
       and pg_get_constraintdef(oid) like '%chef%'
  ) then
    raise warning 'FAILED: staff.role still refuses chef';
    v_fail := v_fail + 1;
  end if;

  -- 2. the three functions exist
  for v_sig in
    select unnest(array[
      'public.is_chef()',
      'public.chef_orders()',
      'public.set_order_status(uuid, text)',
      'public.advance_order_status(text)'
    ])
  loop
    if to_regprocedure(v_sig) is null then
      raise warning 'FAILED: % does not exist', v_sig;
      v_fail := v_fail + 1;
    end if;
  end loop;

  -- 3. both status functions now carry a kitchen check. Without this the grant
  --    below would hand every signed-in customer the ability to mark their own
  --    order delivered, which is the exact hole the revokes used to plug.
  for v_sig in
    select unnest(array[
      'public.set_order_status(uuid, text)',
      'public.advance_order_status(text)'
    ])
  loop
    if position('not_kitchen' in pg_get_functiondef(to_regprocedure(v_sig))) = 0 then
      raise warning 'FAILED: % has no role check', v_sig;
      v_fail := v_fail + 1;
    end if;
  end loop;

  -- 4. and anon holds none of them
  for v_sig in
    select unnest(array[
      'public.chef_orders()',
      'public.set_order_status(uuid, text)',
      'public.advance_order_status(text)'
    ])
  loop
    if has_function_privilege('anon', v_sig, 'execute') then
      raise warning 'FAILED: anon can execute %', v_sig;
      v_fail := v_fail + 1;
    end if;
  end loop;

  if v_fail = 0 then
    raise notice '--- KITCHEN READY. The chef can move orders along. ---';
  else
    raise exception '--- % CHECK(S) FAILED ---', v_fail;
  end if;
end $$;

-- Who holds what now.
select s.role, u.email, s.created_at
  from public.staff s join auth.users u on u.id = s.user_id
 order by s.role;
