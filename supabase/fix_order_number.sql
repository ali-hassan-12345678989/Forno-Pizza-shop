-- ---------------------------------------------------------------------------
-- Fix: order numbers wrapped around and started colliding.
--
-- THE BUG
-- schema.sql created the column as:
--   order_number text not null unique
--     default lpad(nextval('public.order_number_seq')::text, 4, '0')
--
-- Postgres lpad() pads a short string UP to the target width, but TRUNCATES
-- one that is already longer:
--   lpad('999',   4, '0') -> '0999'   (padded, intended)
--   lpad('10160', 4, '0') -> '1016'   (truncated, NOT intended)
--
-- So the moment the sequence passed 9999, place_order() began re-issuing
-- numbers from the 1000-9999 range that had already been handed out. Where
-- the older order still existed, the insert died on orders_order_number_key
-- and the customer's order failed outright.
--
-- THE FIX
-- Pad up to 4 characters, never truncate. Numbers simply grow to 5 digits.
-- Existing numbers are all <= 4 characters, so nothing new can collide with
-- anything old. The sequence is NOT reset - rewinding it would recreate the
-- very collisions this removes.
-- ---------------------------------------------------------------------------

create or replace function public.next_order_number()
returns text
language sql
volatile
as $$
  select case when n < 10000 then lpad(n::text, 4, '0') else n::text end
  from (select nextval('public.order_number_seq') as n) s;
$$;

comment on function public.next_order_number() is
  'Order number generator. Pads to 4 characters but never truncates, so the '
  'sequence can grow past 9999 without re-issuing an existing number.';

alter table public.orders
  alter column order_number set default public.next_order_number();

-- Same posture as the sequence itself: only place_order(), which runs as the
-- owner, ever needs this.
revoke execute on function public.next_order_number() from public;
revoke execute on function public.next_order_number() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
do $$
declare
  v_seq        bigint;
  v_default    text;
  v_dupe_risk  int;
  v_sample     text[];
  v_fail       int := 0;
begin
  select last_value into v_seq from public.order_number_seq;

  select pg_get_expr(d.adbin, d.adrelid) into v_default
    from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.orders'::regclass and a.attname = 'order_number';

  raise notice 'sequence is currently at : %', v_seq;
  raise notice 'column default is now    : %', v_default;

  if v_seq <= 9999 then
    raise notice 'NOTE: sequence is still under 10000, so the old code had not '
                 'started colliding yet. The fix is still correct and prevents it.';
  end if;

  -- 1. the default must no longer be the truncating lpad
  if v_default like '%lpad%' then
    raise warning 'CHECK 1 FAILED: default still uses lpad()';
    v_fail := v_fail + 1;
  else
    raise notice 'CHECK 1 ok: default no longer truncates';
  end if;

  -- 2. the generator must never return fewer digits than the number has
  select array_agg(public.next_order_number()) into v_sample
    from generate_series(1, 3);
  raise notice 'CHECK 2: three freshly generated numbers: %', v_sample;
  if exists (select 1 from unnest(v_sample) x where length(x) < 4) then
    raise warning 'CHECK 2 FAILED: generated a number shorter than 4 characters';
    v_fail := v_fail + 1;
  else
    raise notice 'CHECK 2 ok: all generated numbers are at least 4 characters';
  end if;

  -- 3. nothing newly generated may match an order number already stored
  select count(*) into v_dupe_risk
    from public.orders o
   where o.order_number = any (v_sample);
  if v_dupe_risk > 0 then
    raise warning 'CHECK 3 FAILED: % generated number(s) already exist', v_dupe_risk;
    v_fail := v_fail + 1;
  else
    raise notice 'CHECK 3 ok: no generated number collides with an existing order';
  end if;

  if v_fail = 0 then
    raise notice '--- ALL 3 CHECKS PASSED - order numbers are fixed ---';
  else
    raise exception '--- % CHECK(S) FAILED ---', v_fail;
  end if;
end $$;
