-- ---------------------------------------------------------------------------
-- Part 4, task 1: who counts as staff.
--
-- The PRD is explicit (section 8): "Single Admin account and single Manager
-- account - no multi-user role management needed in v1." So this is a two-row
-- table, and a unique index on role is what keeps it that way. Building a
-- general permissions system here would be inventing scope.
--
-- A customer must never be able to see who the staff are, nor grant themselves
-- a role. Both layers are closed, the same way ingredients and recipes already
-- are in schema.sql: no GRANT, and RLS enabled with no policy. Postgres refuses
-- at the privilege layer before RLS is even consulted.
--
-- Role checks for the panels themselves go through the helper functions below,
-- which are SECURITY DEFINER and so can read this table while nobody else can.
-- ---------------------------------------------------------------------------

create table if not exists public.staff (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  role       text        not null check (role in ('manager', 'admin')),
  created_at timestamptz not null default now()
);

comment on table public.staff is
  'The single Manager and single Admin. Unreachable by any client: no grant, '
  'RLS on with no policy. Read only through the SECURITY DEFINER helpers.';

-- One Manager, one Admin. v1 has no concept of a second of either, and this
-- index is what makes that a database guarantee rather than a convention.
create unique index if not exists staff_one_account_per_role
  on public.staff (role);

alter table public.staff enable row level security;

revoke all on public.staff from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Role helpers.
--
-- Each answers only "what is the CALLER", never "who else is staff", so
-- exposing them to a signed-in user leaks nothing: a customer calling
-- staff_role() gets null, which they could already infer.
-- ---------------------------------------------------------------------------

create or replace function public.staff_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select s.role from public.staff s where s.user_id = auth.uid();
$$;

create or replace function public.is_manager()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.staff s
     where s.user_id = auth.uid() and s.role = 'manager'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.staff s
     where s.user_id = auth.uid() and s.role = 'admin'
  );
$$;

comment on function public.staff_role() is
  'Role of the calling user, or null. Never reveals anyone else''s role.';

-- create function grants EXECUTE to PUBLIC by default, which would hand these
-- to anon too. Close that, then open them to signed-in users only.
revoke execute on function public.staff_role() from public;
revoke execute on function public.is_manager() from public;
revoke execute on function public.is_admin()   from public;

grant execute on function public.staff_role() to authenticated;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.is_admin()   to authenticated;
