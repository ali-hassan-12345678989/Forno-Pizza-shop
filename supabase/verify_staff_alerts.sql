-- Forno Pizza — proving low-stock alerts are raised, not raised twice, and
-- closed again.
--
-- Run in the Supabase SQL Editor: paste the whole file, run it once, read the
-- verdict row at the top. Every row should say "ok".
--
-- RUN ORDER: after staff_alerts.sql.
--
-- WHY THIS FILE EXISTS
-- The integration suite signs in as the Manager and can prove
-- staff_stock_alerts() returns what it should. It cannot MAKE an alert happen:
-- driving a real ingredient below its threshold through the customer path
-- would take dozens of orders. This drives the crossing directly, through the
-- same note_stock_level() the deduction path calls, and puts everything back.
--
-- Leaves nothing behind: the ingredient's stock and the alerts table are
-- snapshotted and restored.

drop table if exists alert_check_results;
create temporary table alert_check_results (seq serial, check_name text, result text);

drop table if exists alert_snapshot;
create temporary table alert_snapshot as select * from public.stock_alerts;

create or replace function pg_temp.note(p_name text, p_result text)
returns void language sql as $$
  insert into alert_check_results (check_name, result) values (p_name, p_result);
$$;

do $$
declare
  v_id        uuid;
  v_name      text;
  v_stock0    numeric;   -- stock as this file found it
  v_threshold numeric;
  v_open      int;
  v_after     numeric;
  v_resolved  timestamptz;
begin
  -- A healthy ingredient with a real threshold and no alert already open.
  select i.id, i.name, i.stock_quantity, i.low_stock_threshold
    into v_id, v_name, v_stock0, v_threshold
    from public.ingredients i
   where i.low_stock_threshold > 0
     and i.stock_quantity >= i.low_stock_threshold
     and not exists (
       select 1 from public.stock_alerts a
        where a.ingredient_id = i.id and a.resolved_at is null)
   order by i.name
   limit 1;

  if v_id is null then
    perform pg_temp.note('a healthy ingredient to test with',
      'FAIL — every ingredient is already low or already alerting; restock first');
    return;
  end if;

  perform pg_temp.note(format('testing with %s (stock %s, threshold %s)',
                              v_name, v_stock0, v_threshold), 'ok');

  -- ---- the function refuses a session with no staff role ----------------
  begin
    perform public.staff_stock_alerts();
    perform pg_temp.note('staff_stock_alerts() refuses a non-staff session',
      'FAIL — it returned rows to a session with no staff role');
  exception when others then
    perform pg_temp.note('staff_stock_alerts() refuses a non-staff session',
      case when sqlerrm like '%not_staff%' then 'ok'
           else format('FAIL — refused with the wrong error: %s', sqlerrm) end);
  end;

  -- ---- crossing DOWN raises exactly one alert ---------------------------
  v_after := v_threshold - 1;
  update public.ingredients set stock_quantity = v_after where id = v_id;
  perform public.note_stock_level(v_id, v_stock0, v_after);

  select count(*) into v_open
    from public.stock_alerts
   where ingredient_id = v_id and resolved_at is null;

  perform pg_temp.note('crossing below the threshold raises one alert',
    case when v_open = 1 then 'ok'
         else format('FAIL — expected 1 open alert, found %s', v_open) end);

  perform pg_temp.note('the alert records the level that triggered it',
    case when exists (select 1 from public.stock_alerts
                       where ingredient_id = v_id and resolved_at is null
                         and stock_at_trigger = v_after)
         then 'ok' else 'FAIL — stock_at_trigger does not match' end);

  -- ---- falling FURTHER must not raise a second one ----------------------
  -- note_stock_level fires on the CROSSING, not the state. Getting this wrong
  -- would give the Manager a new alert for every order of a low ingredient.
  perform public.note_stock_level(v_id, v_after, v_threshold - 2);
  update public.ingredients set stock_quantity = v_threshold - 2 where id = v_id;

  select count(*) into v_open
    from public.stock_alerts
   where ingredient_id = v_id and resolved_at is null;

  perform pg_temp.note('falling further does not raise a second alert',
    case when v_open = 1 then 'ok'
         else format('FAIL — %s open alerts after a second fall; it is firing on '
                     'the state rather than the crossing', v_open) end);

  -- ---- an open alert is genuinely still below ---------------------------
  perform pg_temp.note('an open alert is still below its threshold',
    case when (select i.stock_quantity < i.low_stock_threshold
                 from public.ingredients i where i.id = v_id)
         then 'ok' else 'FAIL — open alert on an ingredient that is fine' end);

  -- ---- crossing UP resolves it ------------------------------------------
  perform public.note_stock_level(v_id, v_threshold - 2, v_stock0);
  update public.ingredients set stock_quantity = v_stock0 where id = v_id;

  select count(*) into v_open
    from public.stock_alerts
   where ingredient_id = v_id and resolved_at is null;

  perform pg_temp.note('recovering above the threshold resolves the alert',
    case when v_open = 0 then 'ok'
         else format('FAIL — %s alert(s) still open after restocking', v_open) end);

  select resolved_at into v_resolved
    from public.stock_alerts
   where ingredient_id = v_id
   order by triggered_at desc
   limit 1;

  perform pg_temp.note('the resolved alert is stamped with a time',
    case when v_resolved is not null then 'ok'
         else 'FAIL — resolved_at was never set' end);

  perform pg_temp.note('the history row is kept, not deleted',
    case when exists (select 1 from public.stock_alerts
                       where ingredient_id = v_id and resolved_at is not null)
         then 'ok' else 'FAIL — resolving an alert threw the record away' end);

  -- ---- restore -----------------------------------------------------------
  update public.ingredients set stock_quantity = v_stock0 where id = v_id;

  perform pg_temp.note('stock is back where this file found it',
    case when (select stock_quantity from public.ingredients where id = v_id) = v_stock0
         then 'ok' else 'FAIL — this file changed stock and did not put it back' end);
end $$;

-- Remove only the alert rows this file created; put back anything it closed.
delete from public.stock_alerts a
 where not exists (select 1 from alert_snapshot s where s.id = a.id);

update public.stock_alerts a
   set resolved_at = s.resolved_at
  from alert_snapshot s
 where s.id = a.id and a.resolved_at is distinct from s.resolved_at;

do $$
begin
  perform pg_temp.note('the alerts table is back how this file found it',
    case when (select count(*) from public.stock_alerts) = (select count(*) from alert_snapshot)
          and not exists (select * from public.stock_alerts except select * from alert_snapshot)
         then 'ok' else 'FAIL — alert rows were left behind or changed' end);
end $$;

select 0 as seq,
  case when count(*) filter (where result like 'FAIL%') = 0
       then format('*** ALL %s CHECKS PASSED ***', count(*))
       else format('*** %s OF %s FAILED — see the rows below ***',
                   count(*) filter (where result like 'FAIL%'), count(*))
  end as check_name,
  case when count(*) filter (where result like 'FAIL%') = 0
       then 'nothing to do'
       else string_agg(check_name, '; ') filter (where result like 'FAIL%')
  end as result
from alert_check_results

union all

select seq, check_name, result from alert_check_results
order by seq;
