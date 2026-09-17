-- Forno Pizza — proving the status and cancellation guards actually refuse
-- things.
--
-- Run in the Supabase SQL Editor: paste the whole file, run it once, read the
-- table it prints. Every row should say "ok".
--
-- WHY THIS FILE EXISTS
-- set_order_status() is revoked from anon and authenticated, which is the whole
-- point of it — but it also means the integration suite, which runs on the anon
-- key, can only ever prove that the function says no. Everything it does when
-- it says YES has to be checked from a session that is allowed to call it, and
-- that is this file.
--
-- Leaves nothing behind: the four orders it places are deleted at the end.

-- ---------------------------------------------------------------------------
-- 1. An assertion helper, for this session only.
--    pg_temp is dropped automatically when the connection closes.
-- ---------------------------------------------------------------------------

create or replace function pg_temp.expect_error(p_sql text, p_code text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return format('FAIL — expected %s, but it was allowed', p_code);
exception when others then
  if sqlerrm = p_code then
    return format('ok — refused with %s', p_code);
  end if;
  return format('FAIL — expected %s, got "%s"', p_code, sqlerrm);
end;
$$;

create or replace function pg_temp.expect_ok(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok — allowed';
exception when others then
  return format('FAIL — refused with "%s"', sqlerrm);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Somewhere to collect the answers, so one final SELECT can print them all.
--    The SQL editor only shows the last statement's result.
-- ---------------------------------------------------------------------------

drop table if exists status_check_results;
create temporary table status_check_results (seq serial, check_name text, result text);

-- ---------------------------------------------------------------------------
-- 3. The checks.
-- ---------------------------------------------------------------------------

do $$
declare
  v_size_id    uuid;
  v_del_id     uuid;
  v_pick_id    uuid;
  v_window_id  uuid;
  v_started_id uuid;
  v_token      uuid;
  v_hist       int;

  -- A fresh mobile per order: place_order() rate-limits five per number per
  -- two minutes, and this file places four.
  v_phone      text;

begin
  -- Each check below is its own statement rather than one multi-row VALUES
  -- list. Several depend on the one before having actually run — you cannot
  -- test "cannot be walked backwards" until something has walked it forwards —
  -- and Postgres promises no evaluation order inside a VALUES list.
  select ms.id into v_size_id
  from public.menu_item_sizes ms
  join public.menu_items mi on mi.id = ms.menu_item_id
  where mi.is_active and not mi.is_sold_out
  limit 1;

  if v_size_id is null then
    insert into status_check_results (check_name, result)
    values ('setup', 'FAIL — no orderable menu item found; run seed_menu.sql');
    return;
  end if;

  -- Two orders, one on each ladder.
  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');
  select (public.place_order(
    'delivery', 'Guard Check', v_phone,
    'House 12, Street 4, F-7/2, Islamabad', null,
    jsonb_build_array(jsonb_build_object('size_id', v_size_id, 'quantity', 1))
  ) -> 'order' ->> 'id')::uuid into v_del_id;

  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');
  select (public.place_order(
    'pickup', 'Guard Check', v_phone, null, null,
    jsonb_build_array(jsonb_build_object('size_id', v_size_id, 'quantity', 1))
  ) -> 'order' ->> 'id')::uuid into v_pick_id;

  -- --- the ladder is per fulfillment type ----------------------------------

  insert into status_check_results (check_name, result) values
    ('a pickup order cannot go out for delivery',
     pg_temp.expect_error(
       format('select public.set_order_status(%L, %L)', v_pick_id, 'out_for_delivery'),
       'invalid_status'));

  insert into status_check_results (check_name, result) values
    ('a delivery order cannot be ready for pickup',
     pg_temp.expect_error(
       format('select public.set_order_status(%L, %L)', v_del_id, 'ready_for_pickup'),
       'invalid_status'));

  insert into status_check_results (check_name, result) values
    ('a status that is not a status at all is refused',
     pg_temp.expect_error(
       format('select public.set_order_status(%L, %L)', v_del_id, 'on_the_moon'),
       'invalid_status'));

  -- --- forward only ---------------------------------------------------------

  insert into status_check_results (check_name, result) values
    ('an order cannot be set to the stage it is already on',
     pg_temp.expect_error(
       format('select public.set_order_status(%L, %L)', v_del_id, 'placed'),
       'status_not_forward'));

  insert into status_check_results (check_name, result) values
    ('a skip forward IS allowed (placed straight to out for delivery)',
     pg_temp.expect_ok(
       format('select public.set_order_status(%L, %L)', v_del_id, 'out_for_delivery')));

  insert into status_check_results (check_name, result) values
    ('an order cannot be walked backwards',
     pg_temp.expect_error(
       format('select public.set_order_status(%L, %L)', v_del_id, 'preparing'),
       'status_not_forward'));

  -- --- an order that no longer moves ----------------------------------------

  insert into status_check_results (check_name, result) values
    ('the last stage is reachable',
     pg_temp.expect_ok(
       format('select public.set_order_status(%L, %L)', v_del_id, 'delivered')));

  insert into status_check_results (check_name, result) values
    ('a delivered order cannot be advanced again',
     pg_temp.expect_error(
       format('select public.advance_order_status((select order_number from public.orders where id = %L))',
              v_del_id),
       'already_final'));

  insert into status_check_results (check_name, result) values
    ('an order that does not exist is refused',
     pg_temp.expect_error(
       format('select public.set_order_status(%L, %L)', gen_random_uuid(), 'preparing'),
       'order_not_found'));

  -- --- a cancelled order is out of the game ---------------------------------
  -- Cancelling properly is checked further down. Setting the column directly
  -- here is the point: however an order comes to be cancelled, the kitchen must
  -- not be able to move it afterwards.

  update public.orders set status = 'cancelled' where id = v_pick_id;

  insert into status_check_results (check_name, result) values
    ('a cancelled order cannot be set to another status',
     pg_temp.expect_error(
       format('select public.set_order_status(%L, %L)', v_pick_id, 'preparing'),
       'order_cancelled'));

  insert into status_check_results (check_name, result) values
    ('a cancelled order cannot be advanced',
     pg_temp.expect_error(
       format('select public.advance_order_status((select order_number from public.orders where id = %L))',
              v_pick_id),
       'order_cancelled'));

  -- --- the history behind it ------------------------------------------------
  -- The delivery order went placed -> out_for_delivery -> delivered, skipping
  -- 'preparing'. Three rows, not four: the trigger records what happened, not
  -- what the ladder says should have.

  select count(*) into v_hist
  from public.order_status_history where order_id = v_del_id;

  insert into status_check_results (check_name, result) values
    ('history logged one row per real change',
     case when v_hist = 3
          then 'ok — 3 rows (placed, out_for_delivery, delivered)'
          else format('FAIL — expected 3 history rows, found %s', v_hist) end);

  insert into status_check_results (check_name, result) values
    ('the skipped stage was not invented',
     case when not exists (
            select 1 from public.order_status_history
            where order_id = v_del_id and status = 'preparing')
          then 'ok — no row for the stage that never happened'
          else 'FAIL — a "preparing" row exists for a stage that was skipped' end);

  -- --- the cancellation window ----------------------------------------------
  -- The half tests/cancel-order.test.js cannot reach: it runs on the anon key,
  -- which by design cannot advance an order, so it can never get one INTO the
  -- state where cancelling should be refused.

  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');
  select (public.place_order(
    'delivery', 'Guard Check', v_phone,
    'House 12, Street 4, F-7/2, Islamabad', null,
    jsonb_build_array(jsonb_build_object('size_id', v_size_id, 'quantity', 1))
  ) -> 'order' ->> 'id')::uuid into v_window_id;

  select access_token into v_token from public.orders where id = v_window_id;

  insert into status_check_results (check_name, result) values
    ('a waiting order can be cancelled',
     pg_temp.expect_ok(format('select public.cancel_order(%L)', v_token)));

  insert into status_check_results (check_name, result) values
    ('the same order cannot be cancelled twice',
     pg_temp.expect_error(format('select public.cancel_order(%L)', v_token), 'already_cancelled'));

  -- A second order, this time started by the kitchen first.
  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');
  select (public.place_order(
    'delivery', 'Guard Check', v_phone,
    'House 12, Street 4, F-7/2, Islamabad', null,
    jsonb_build_array(jsonb_build_object('size_id', v_size_id, 'quantity', 1))
  ) -> 'order' ->> 'id')::uuid into v_started_id;

  select access_token into v_token from public.orders where id = v_started_id;

  insert into status_check_results (check_name, result) values
    ('the kitchen can start an order',
     pg_temp.expect_ok(
       format('select public.set_order_status(%L, %L)', v_started_id, 'preparing')));

  insert into status_check_results (check_name, result) values
    ('an order the kitchen has STARTED cannot be cancelled',
     pg_temp.expect_error(
       format('select public.cancel_order(%L)', v_token),
       'cancel_window_closed'));

  insert into status_check_results (check_name, result) values
    ('nor can one that has already been delivered',
     pg_temp.expect_error(
       format('select public.cancel_order((select access_token from public.orders where id = %L))',
              v_del_id),
       'cancel_window_closed'));

  insert into status_check_results (check_name, result) values
    ('the refused cancel left the started order alone',
     case when (select status from public.orders where id = v_started_id) = 'preparing'
          then 'ok — still preparing'
          else format('FAIL — status is now %s',
                      (select status from public.orders where id = v_started_id)) end);

  insert into status_check_results (check_name, result) values
    ('an order id is not accepted in place of the access token',
     pg_temp.expect_error(
       format('select public.cancel_order(%L)', v_started_id),
       'order_not_found'));

  -- --- tidy up ---------------------------------------------------------------
  -- order_items, order_item_toppings and order_status_history all cascade.

  delete from public.orders
  where id in (v_del_id, v_pick_id, v_window_id, v_started_id);

  insert into status_check_results (check_name, result)
  values ('test orders removed', 'ok — nothing left behind');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The verdict.
--
-- The summary row comes first so the answer is readable without scrolling or
-- scanning twenty rows for the one that does not say "ok" — a check table you
-- have to read carefully is a check table that eventually gets skimmed.
-- ---------------------------------------------------------------------------

select
  0 as seq,
  case when count(*) filter (where result like 'FAIL%') = 0
       then format('*** ALL %s CHECKS PASSED ***', count(*))
       else format('*** %s OF %s FAILED — see the rows below ***',
                   count(*) filter (where result like 'FAIL%'), count(*))
  end as check_name,
  case when count(*) filter (where result like 'FAIL%') = 0
       then 'nothing to do'
       else string_agg(check_name, '; ') filter (where result like 'FAIL%')
  end as result
from status_check_results

union all

select seq, check_name, result from status_check_results
order by seq;
