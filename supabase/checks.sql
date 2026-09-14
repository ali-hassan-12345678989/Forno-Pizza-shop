-- Forno Pizza — security + data sanity checks. Run in the Supabase SQL Editor.
-- Run these one at a time; the editor only shows the last statement's result.
--
-- Worth re-running after ANY change to grants or policies — most importantly in
-- Part 4, when Manager/Admin get granted access to the staff-only tables. A
-- table with RLS off looks identical to a locked one from the client side right
-- up until something grants it, at which point it is simply open.

-- 1. Every public table must report rls_on = true.
--    ingredients, recipes and stock_alerts are expected to show 0 policies —
--    that is deliberate (denied at both layers until Part 4).
select t.tablename,
       t.rowsecurity as rls_on,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tablename) as policies
from pg_tables t
where t.schemaname = 'public'
order by t.tablename;

-- 2. Seed rows the customer-facing key cannot read back, so they can only be
--    confirmed from here. Expect 1 and 1.
select (select count(*) from public.ingredients) as ingredients,
       (select count(*) from public.recipes)     as recipes;
