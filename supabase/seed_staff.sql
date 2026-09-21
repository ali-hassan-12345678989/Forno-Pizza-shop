-- ---------------------------------------------------------------------------
-- Part 4, task 1: hand the Manager and Admin roles to two real accounts.
--
-- BEFORE RUNNING: both accounts must already exist in Supabase Auth.
-- Create them in the dashboard under Authentication -> Users -> Add user,
-- with "Auto Confirm User" ticked, then put their addresses below.
--
-- Safe to run more than once. It moves each role to the named account rather
-- than adding rows, so re-running after changing an address does the right
-- thing instead of tripping the one-account-per-role index.
-- ---------------------------------------------------------------------------

do $$
declare
  -- >>> PUT YOUR TWO ADDRESSES HERE BEFORE RUNNING <<<
  --
  -- They must match TEST_MANAGER_EMAIL / TEST_ADMIN_EMAIL in .env, because the
  -- role tests sign in as them. They are placeholders in the repository on
  -- purpose: this repo is public, and publishing the address a shop's Manager
  -- logs in with gives an attacker half a credential for nothing in return.
  v_manager_email constant text := 'REPLACE_WITH_MANAGER_EMAIL';
  v_admin_email   constant text := 'REPLACE_WITH_ADMIN_EMAIL';

  v_manager_id uuid;
  v_admin_id   uuid;
begin
  select id into v_manager_id from auth.users where lower(email) = lower(v_manager_email);
  select id into v_admin_id   from auth.users where lower(email) = lower(v_admin_email);

  if v_manager_id is null then
    raise exception
      'No auth user with email %. Create it first: Authentication -> Users -> Add user (tick Auto Confirm User).',
      v_manager_email;
  end if;

  if v_admin_id is null then
    raise exception
      'No auth user with email %. Create it first: Authentication -> Users -> Add user (tick Auto Confirm User).',
      v_admin_email;
  end if;

  if v_manager_id = v_admin_id then
    raise exception
      'Manager and Admin must be different accounts. Both addresses resolve to the same user (%).',
      v_manager_id;
  end if;

  -- Clear whoever currently holds each role, then grant it. Two statements
  -- rather than an upsert because the unique index is on role, not user_id.
  delete from public.staff where role = 'manager' and user_id <> v_manager_id;
  delete from public.staff where role = 'admin'   and user_id <> v_admin_id;

  insert into public.staff (user_id, role) values (v_manager_id, 'manager')
    on conflict (user_id) do update set role = excluded.role;

  insert into public.staff (user_id, role) values (v_admin_id, 'admin')
    on conflict (user_id) do update set role = excluded.role;

  raise notice 'manager -> % (%)', v_manager_email, v_manager_id;
  raise notice 'admin   -> % (%)', v_admin_email,   v_admin_id;
end $$;

-- What the table holds now. Emails come from auth.users, which is why this is
-- a join rather than a column on public.staff - one source of truth per fact.
select s.role,
       u.email,
       s.user_id,
       s.created_at
  from public.staff s
  join auth.users u on u.id = s.user_id
 order by s.role;
