-- Forno Pizza — proving the staff table is genuinely unreachable.
--
-- Run in the Supabase SQL Editor: paste the whole file, run it once, read the
-- verdict row at the top. Every row should say "ok".
--
-- RUN ORDER: after staff_roles.sql.
--
-- WHY THIS FILE EXISTS
-- The integration suite can prove a customer's client gets nothing back from
-- public.staff. It cannot prove WHY. "No rows" and "no privilege" look
-- identical from the outside, and only one of them is safe: a policy added
-- carelessly later would turn the first into a leak without anything failing.
-- These checks read the catalog directly, so they distinguish the two.
--
-- Leaves nothing behind: the staff table is snapshotted and restored.

drop table if exists staff_check_results;
create temporary table staff_check_results (seq serial, check_name text, result text);

drop table if exists staff_snapshot;
create temporary table staff_snapshot as select * from public.staff;

create or replace function pg_temp.expect_error(p_sql text, p_code text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return format('FAIL — expected SQLSTATE %s, but the statement succeeded', p_code);
exception when others then
  if sqlstate = p_code then return 'ok';
  end if;
  return format('FAIL — expected SQLSTATE %s, got %s (%s)', p_code, sqlstate, sqlerrm);
end $$;

create or replace function pg_temp.note(p_name text, p_result text)
returns void language sql as $$
  insert into staff_check_results (check_name, result) values (p_name, p_result);
$$;

do $$
declare
  v_u1 uuid;
  v_u2 uuid;
begin
  -- ---- structure -------------------------------------------------------
  perform pg_temp.note('staff table exists',
    case when to_regclass('public.staff') is not null then 'ok'
         else 'FAIL — public.staff is missing' end);

  perform pg_temp.note('RLS is enabled on staff',
    case when (select relrowsecurity from pg_class where oid = 'public.staff'::regclass)
         then 'ok' else 'FAIL — row level security is off' end);

  perform pg_temp.note('staff has no policy, so RLS denies everything',
    case when (select count(*) from pg_policies
                where schemaname = 'public' and tablename = 'staff') = 0
         then 'ok'
         else format('FAIL — %s policy/policies exist; a deny-all table must have none',
                     (select count(*) from pg_policies
                       where schemaname = 'public' and tablename = 'staff')) end);

  perform pg_temp.note('one-account-per-role index exists',
    case when exists (select 1 from pg_indexes
                       where schemaname = 'public' and tablename = 'staff'
                         and indexdef ilike '%unique%(role)%')
         then 'ok' else 'FAIL — role is not uniquely indexed' end);

  -- ---- privileges: the layer that refuses before RLS is consulted -------
  perform pg_temp.note('anon has no privilege on staff',
    case when (select count(*) from information_schema.role_table_grants
                where table_schema = 'public' and table_name = 'staff'
                  and grantee = 'anon') = 0
         then 'ok' else 'FAIL — anon has been granted something on staff' end);

  perform pg_temp.note('authenticated has no privilege on staff',
    case when (select count(*) from information_schema.role_table_grants
                where table_schema = 'public' and table_name = 'staff'
                  and grantee = 'authenticated') = 0
         then 'ok' else 'FAIL — authenticated has been granted something on staff' end);

  -- ---- the helpers -----------------------------------------------------
  perform pg_temp.note('staff_role() is SECURITY DEFINER',
    case when (select prosecdef from pg_proc where oid = 'public.staff_role()'::regprocedure)
         then 'ok' else 'FAIL — not SECURITY DEFINER, so it cannot read staff' end);

  perform pg_temp.note('is_manager() is SECURITY DEFINER',
    case when (select prosecdef from pg_proc where oid = 'public.is_manager()'::regprocedure)
         then 'ok' else 'FAIL — not SECURITY DEFINER' end);

  perform pg_temp.note('is_admin() is SECURITY DEFINER',
    case when (select prosecdef from pg_proc where oid = 'public.is_admin()'::regprocedure)
         then 'ok' else 'FAIL — not SECURITY DEFINER' end);

  perform pg_temp.note('the helpers pin search_path',
    case when (select count(*) from pg_proc
                where oid in ('public.staff_role()'::regprocedure,
                              'public.is_manager()'::regprocedure,
                              'public.is_admin()'::regprocedure)
                  and array_to_string(proconfig, ',') like '%search_path%') = 3
         then 'ok' else 'FAIL — a SECURITY DEFINER function without a pinned search_path is hijackable' end);

  perform pg_temp.note('anon cannot execute the role helpers',
    case when (select count(*) from information_schema.role_routine_grants
                where routine_schema = 'public'
                  and routine_name in ('staff_role', 'is_manager', 'is_admin')
                  and grantee = 'anon') = 0
         then 'ok' else 'FAIL — anon can call a role helper' end);

  perform pg_temp.note('authenticated can execute all three role helpers',
    case when (select count(distinct routine_name) from information_schema.role_routine_grants
                where routine_schema = 'public'
                  and routine_name in ('staff_role', 'is_manager', 'is_admin')
                  and grantee = 'authenticated') = 3
         then 'ok' else 'FAIL — a signed-in user cannot discover their own role' end);

  -- ---- behaviour: needs two real auth users ----------------------------
  select id into v_u1 from auth.users order by created_at limit 1;
  select id into v_u2 from auth.users where id <> v_u1 order by created_at limit 1;

  if v_u1 is null or v_u2 is null then
    perform pg_temp.note('second manager is rejected',
      'FAIL — needs 2 auth users to test; run the integration suite once, then re-run this file');
    perform pg_temp.note('an unknown role is rejected',
      'FAIL — needs 2 auth users to test; run the integration suite once, then re-run this file');
  else
    -- Clear the whole table, not just these two users. The real Manager and
    -- Admin hold the only 'manager' and 'admin' rows the unique index allows,
    -- so leaving them in place would make the insert below collide with THEM
    -- rather than with the scratch row, and the check would pass for the wrong
    -- reason. staff_snapshot puts everything back at the end.
    delete from public.staff;
    insert into public.staff (user_id, role) values (v_u1, 'manager');

    perform pg_temp.note('second manager is rejected',
      pg_temp.expect_error(
        format('insert into public.staff (user_id, role) values (%L, %L)', v_u2, 'manager'),
        '23505'));

    perform pg_temp.note('an unknown role is rejected',
      pg_temp.expect_error(
        format('insert into public.staff (user_id, role) values (%L, %L)', v_u2, 'chef'),
        '23514'));
  end if;

  -- ---- no session means no role ----------------------------------------
  perform pg_temp.note('staff_role() is null without a session',
    case when public.staff_role() is null then 'ok'
         else format('FAIL — returned %L for a session with no auth.uid()', public.staff_role()) end);
end $$;

-- Put the table back exactly as it was found.
delete from public.staff;
insert into public.staff select * from staff_snapshot;

do $$
begin
  perform pg_temp.note('staff table restored to how this file found it',
    case when (select count(*) from public.staff) = (select count(*) from staff_snapshot)
         and not exists (select * from public.staff except select * from staff_snapshot)
         then 'ok' else 'FAIL — this file changed the staff table and did not put it back' end);
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
from staff_check_results

union all

select seq, check_name, result from staff_check_results
order by seq;
