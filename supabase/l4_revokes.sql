-- ---------------------------------------------------------------------------
-- Forno Pizza — L-4: SAY WHO MAY RUN THESE TEN FUNCTIONS.
--
-- Postgres grants EXECUTE on every new function to PUBLIC by default. Ten of
-- this project's functions were granted to anon and authenticated without ever
-- revoking that default first, so those grants were decorating a door that was
-- already open to everyone.
--
-- Nothing changes for a real caller. anon and authenticated keep exactly the
-- access they have today, and tests/function-grants.test.js exists to prove it.
-- What changes is that the permission now states its audience instead of
-- inheriting one, so a role added to this database later inherits nothing by
-- accident.
--
-- SAFE TO RE-RUN. Revoke and grant are both idempotent; a second run simply
-- reports that none of the ten were open.
--
-- WHAT IT PRINTS: how many of the ten PUBLIC could execute BEFORE, a
-- per-function table AFTER, and a verdict. It raises rather than finishing
-- quietly if any of the ten is still open to PUBLIC, or if anon or
-- authenticated lost access on the way.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 0. WHAT PUBLIC CAN REACH BEFORE THIS RUNS
--
-- Recorded first so the run leaves evidence that it DID something, not only
-- evidence that the end state looks right. A file that was never run and a file
-- that ran twice are otherwise indistinguishable from their output.
-- ---------------------------------------------------------------------------

do $$
declare
  -- The ten, by exact signature. A typo here casts to regprocedure and throws,
  -- which is the behaviour wanted: better a loud failure than a silent skip.
  c_targets constant text[] := array[
    'public.can_write_order(uuid)',
    'public.cancel_order(uuid)',
    'public.experience_summary()',
    'public.get_order_by_token(uuid)',
    'public.item_reviews(uuid, int)',
    'public.menu_review_summary()',
    'public.order_reviews(uuid)',
    'public.order_status_values()',
    'public.place_order(text, text, text, text, text, jsonb)',
    'public.submit_review(uuid, uuid, int, text)'
  ];
  v_sig   text;
  v_open  int := 0;
begin
  foreach v_sig in array c_targets loop
    -- The null check is the whole point.
    --
    -- A function that has never been granted anything explicitly has
    -- proacl = NULL, which means "defaults apply" — and the default includes
    -- EXECUTE for PUBLIC. Looking only for a PUBLIC row inside aclexplode()
    -- finds nothing there and reports the door shut, which is exactly backwards
    -- on exactly the state this file exists to fix.
    if (select p.proacl is null
               or exists (select 1
                            from aclexplode(p.proacl) a
                           where a.grantee = 0            -- 0 is PUBLIC
                             and a.privilege_type = 'EXECUTE')
          from pg_proc p
         where p.oid = v_sig::regprocedure)
    then
      v_open := v_open + 1;
    end if;
  end loop;

  raise notice '=== BEFORE ===';
  raise notice 'of the 10 functions, PUBLIC could execute: %', v_open;
end $$;


-- ---------------------------------------------------------------------------
-- 1. CLOSE THE DEFAULT, THEN STATE THE AUDIENCE
--
-- Revoke first, grant second. `revoke ... from public` does not touch a role's
-- own grant, so the order is not strictly load-bearing — but written the other
-- way round it reads as though it might be, and the next person to edit this
-- file should not have to work that out.
-- ---------------------------------------------------------------------------

revoke execute on function public.can_write_order(uuid)                            from public;
revoke execute on function public.cancel_order(uuid)                               from public;
revoke execute on function public.experience_summary()                             from public;
revoke execute on function public.get_order_by_token(uuid)                         from public;
revoke execute on function public.item_reviews(uuid, int)                          from public;
revoke execute on function public.menu_review_summary()                            from public;
revoke execute on function public.order_reviews(uuid)                              from public;
revoke execute on function public.order_status_values()                            from public;
revoke execute on function public.place_order(text, text, text, text, text, jsonb) from public;
revoke execute on function public.submit_review(uuid, uuid, int, text)             from public;

grant execute on function public.can_write_order(uuid)                            to anon, authenticated;
grant execute on function public.cancel_order(uuid)                               to anon, authenticated;
grant execute on function public.experience_summary()                             to anon, authenticated;
grant execute on function public.get_order_by_token(uuid)                         to anon, authenticated;
grant execute on function public.item_reviews(uuid, int)                          to anon, authenticated;
grant execute on function public.menu_review_summary()                            to anon, authenticated;
grant execute on function public.order_reviews(uuid)                              to anon, authenticated;
grant execute on function public.order_status_values()                            to anon, authenticated;
grant execute on function public.place_order(text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.submit_review(uuid, uuid, int, text)             to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. VERIFY BOTH DIRECTIONS, AND REFUSE TO CLAIM SUCCESS OTHERWISE
--
-- Two-sided on purpose. Checking only that PUBLIC is shut would pass happily on
-- a database where the revoke had taken the access away from the roles that
-- need it too — a far worse outcome than the problem being fixed.
-- ---------------------------------------------------------------------------

do $$
declare
  c_targets constant text[] := array[
    'public.can_write_order(uuid)',
    'public.cancel_order(uuid)',
    'public.experience_summary()',
    'public.get_order_by_token(uuid)',
    'public.item_reviews(uuid, int)',
    'public.menu_review_summary()',
    'public.order_reviews(uuid)',
    'public.order_status_values()',
    'public.place_order(text, text, text, text, text, jsonb)',
    'public.submit_review(uuid, uuid, int, text)'
  ];
  v_sig    text;
  v_public boolean;
  v_anon   boolean;
  v_auth   boolean;
  v_open   int := 0;
  v_fail   int := 0;
begin
  raise notice '=== AFTER ===';
  raise notice '% % % %', rpad('function', 58), rpad('PUBLIC', 8), rpad('anon', 6), 'authenticated';

  foreach v_sig in array c_targets loop
    select p.proacl is null
           or exists (select 1
                        from aclexplode(p.proacl) a
                       where a.grantee = 0
                         and a.privilege_type = 'EXECUTE')
      into v_public
      from pg_proc p
     where p.oid = v_sig::regprocedure;

    v_anon := has_function_privilege('anon',          v_sig, 'EXECUTE');
    v_auth := has_function_privilege('authenticated', v_sig, 'EXECUTE');

    raise notice '% % % %',
      rpad(v_sig, 58),
      rpad(case when v_public then 'OPEN' else 'shut' end, 8),
      rpad(case when v_anon   then 'yes'  else 'NO'   end, 6),
      case when v_auth then 'yes' else 'NO' end;

    if v_public then
      v_open := v_open + 1;
      raise warning 'FAILED: PUBLIC can still execute %', v_sig;
      v_fail := v_fail + 1;
    end if;

    if not v_anon then
      raise warning 'FAILED: anon lost access to %', v_sig;
      v_fail := v_fail + 1;
    end if;

    if not v_auth then
      raise warning 'FAILED: authenticated lost access to %', v_sig;
      v_fail := v_fail + 1;
    end if;
  end loop;

  raise notice 'of the 10 functions, PUBLIC can execute: %', v_open;

  if v_fail = 0 then
    raise notice '--- REVOKED. All ten state their audience; anon and authenticated keep theirs. ---';
  else
    raise exception '--- % CHECK(S) FAILED — L-4 is NOT applied ---', v_fail;
  end if;
end $$;
