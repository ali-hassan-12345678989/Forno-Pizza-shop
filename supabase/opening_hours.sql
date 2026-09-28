-- ---------------------------------------------------------------------------
-- Forno Pizza — OPENING HOURS.
--
-- The shop advertises "Open daily 12pm – 11pm" in its header and has always
-- accepted orders at four in the morning. `shop_settings.hours` is free text:
-- it is printed, and nothing has ever read it back. place_order() validates
-- the fulfilment type, the name, the phone, the address, the notes, the cart
-- size, every quantity, every topping, the rate limit, item availability and
-- stock. It has never asked what time it is.
--
-- What that costs: an order placed at 04:00 is accepted, deducts real stock,
-- and sits on the kitchen board. The tracker tells that customer "25–35 min",
-- because that string is also fixed. They wait for a pizza nobody is making,
-- and the first thing staff meet at noon is a queue of overnight orders whose
-- customers have long since given up.
--
-- WHAT THIS FILE DOES
--   1. Adds an opening window and a master switch to shop_settings
--   2. Adds shop_is_open(), the one place the question is answered
--   3. Refuses orders outside it, on the orders table rather than inside
--      place_order() — so it holds for every path that could ever insert one
--
-- *** IT SHIPS SWITCHED OFF. *** The window defaults to open 24 hours, which
-- is exactly today's behaviour, so running this changes nothing on its own.
-- Turning it on is one statement, at the bottom of this file, and it is left
-- to you deliberately: what hours the shop trades is a business decision, and
-- switching it on means orders outside them are refused.
--
-- RUN ORDER: self-contained. Paste the whole thing into the SQL Editor.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. THE WINDOW
--
-- `time` rather than `timestamptz`: these are wall-clock hours the shop keeps
-- every day, not a moment. The zone is Asia/Karachi, the same one
-- sales_report() and stock_movements() already bucket days by — a shop closing
-- "at 11pm" means 11pm where the shop is, whatever the server thinks.
--
-- accepts_orders is the switch for a day the window cannot describe: a public
-- holiday, a power cut, a kitchen that has run out of everything. Turning it
-- off refuses orders with the same message the closed window uses, and turning
-- it back on needs no arithmetic.
-- ---------------------------------------------------------------------------

alter table public.shop_settings
  add column if not exists opens_at       time    not null default '00:00',
  add column if not exists closes_at      time    not null default '00:00',
  add column if not exists accepts_orders boolean not null default true;

comment on column public.shop_settings.opens_at is
  'Local (Asia/Karachi) time the shop starts taking orders. Equal to closes_at means open 24 hours.';
comment on column public.shop_settings.closes_at is
  'Local (Asia/Karachi) time the shop stops taking orders. Equal to opens_at means open 24 hours.';
comment on column public.shop_settings.accepts_orders is
  'Master switch. False refuses every order regardless of the window — a holiday, a power cut.';


-- ---------------------------------------------------------------------------
-- 2. IS THE SHOP OPEN?
--
-- One function, and everything asks it: the trigger below, the customer's
-- banner, and the tests. A second opinion living in JavaScript is exactly how
-- a browser and a kitchen end up disagreeing about whether an order was
-- allowed.
--
-- p_at is a parameter with a default rather than a call to now() inside the
-- body, so the midnight-crossing case can be tested at 2am without waiting
-- until 2am. A rule about time that can only be exercised at that time is a
-- rule nobody ever tests.
--
-- THREE CASES, and the third is the one that is usually got wrong:
--   opens = closes   open 24 hours. Chosen as the "off" default because it is
--                    the current behaviour exactly, so installing this file
--                    changes nothing until someone decides otherwise.
--   opens <  closes  the ordinary day: 12:00 to 23:00.
--   opens >  closes  the window crosses midnight: 18:00 to 02:00. Open means
--                    at-or-after opening OR before closing, not AND — the
--                    naive version refuses every hour of the night.
--
-- The end is exclusive. At exactly 23:00 a shop closing at 23:00 is shut.
-- ---------------------------------------------------------------------------

create or replace function public.shop_is_open(p_at timestamptz default now())
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select s.accepts_orders
     and case
           when s.opens_at = s.closes_at then true
           when s.opens_at <  s.closes_at
             then local_now >= s.opens_at and local_now < s.closes_at
           else local_now >= s.opens_at or  local_now <  s.closes_at
         end
    from public.shop_settings s
    cross join lateral (select (p_at at time zone 'Asia/Karachi')::time) as t(local_now)
   where s.id = 1
$$;

comment on function public.shop_is_open(timestamptz) is
  'Is the shop taking orders at this moment? The only place the question is answered.';

revoke execute on function public.shop_is_open(timestamptz) from public;
grant  execute on function public.shop_is_open(timestamptz) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. REFUSE ORDERS WHEN SHUT
--
-- On the table, not inside place_order(). place_order() is the only thing that
-- creates an order today, but "today" is the word doing the work in that
-- sentence: a trigger holds for anything that ever inserts one, including a
-- future admin path and anybody with a SQL console who means well.
--
-- It also keeps place_order() defined in exactly one file. supabase/README.md
-- documents what happens when a function is defined in two — schema.sql
-- silently reverting get_order_by_token() is the scar — and adding a second
-- home for a 400-line function to gain one `if` would be trading a real
-- hazard for a small convenience.
--
-- 'shop_closed' matches the snake_case codes place_order() already raises, so
-- it travels through the existing error path to the customer untouched.
-- ---------------------------------------------------------------------------

create or replace function public.refuse_when_closed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.shop_is_open() then
    raise exception 'shop_closed';
  end if;

  return new;
end $$;

drop trigger if exists trg_orders_shop_open on public.orders;

create trigger trg_orders_shop_open
  before insert on public.orders
  for each row
  execute function public.refuse_when_closed();


-- ---------------------------------------------------------------------------
-- 4. VERIFY
--
-- Exercises the arithmetic against fixed timestamps rather than trusting that
-- it reads correctly. Runs entirely on temporary values and touches no row.
-- ---------------------------------------------------------------------------

do $$
declare
  v_fail int := 0;
  v_open boolean;
  v_saved_opens  time;
  v_saved_closes time;
  v_saved_switch boolean;

  -- 14:30 and 04:30 Karachi, as unambiguous UTC instants.
  c_afternoon constant timestamptz := '2026-09-28 09:30:00+00';  -- 14:30 PKT
  c_small_hrs constant timestamptz := '2026-09-28 23:30:00+00';  -- 04:30 PKT next day

  procedure_note text;
begin
  select opens_at, closes_at, accepts_orders
    into v_saved_opens, v_saved_closes, v_saved_switch
    from public.shop_settings where id = 1;

  -- (a) Equal times mean always open.
  update public.shop_settings set opens_at = '00:00', closes_at = '00:00' where id = 1;
  if not public.shop_is_open(c_small_hrs) then
    raise warning 'FAILED: 24-hour window refused 04:30'; v_fail := v_fail + 1;
  end if;

  -- (b) An ordinary daytime window.
  update public.shop_settings set opens_at = '12:00', closes_at = '23:00' where id = 1;
  if not public.shop_is_open(c_afternoon) then
    raise warning 'FAILED: 12:00-23:00 refused 14:30'; v_fail := v_fail + 1;
  end if;
  if public.shop_is_open(c_small_hrs) then
    raise warning 'FAILED: 12:00-23:00 accepted 04:30'; v_fail := v_fail + 1;
  end if;

  -- (c) The window that crosses midnight — the case the naive version breaks.
  update public.shop_settings set opens_at = '18:00', closes_at = '06:00' where id = 1;
  if not public.shop_is_open(c_small_hrs) then
    raise warning 'FAILED: 18:00-06:00 refused 04:30, which is inside it'; v_fail := v_fail + 1;
  end if;
  if public.shop_is_open(c_afternoon) then
    raise warning 'FAILED: 18:00-06:00 accepted 14:30, which is outside it'; v_fail := v_fail + 1;
  end if;

  -- (d) The master switch beats an open window.
  update public.shop_settings set opens_at = '00:00', closes_at = '00:00', accepts_orders = false
   where id = 1;
  if public.shop_is_open(c_afternoon) then
    raise warning 'FAILED: accepts_orders = false still accepted an order'; v_fail := v_fail + 1;
  end if;

  -- Put back exactly what was there before this block ran.
  update public.shop_settings
     set opens_at = v_saved_opens, closes_at = v_saved_closes, accepts_orders = v_saved_switch
   where id = 1;

  select public.shop_is_open() into v_open;
  procedure_note := case when v_open then 'OPEN right now' else 'CLOSED right now' end;

  if v_fail = 0 then
    raise notice '--- opening hours installed. Window: % to %, switch %, %. ---',
      v_saved_opens, v_saved_closes,
      case when v_saved_switch then 'on' else 'OFF' end,
      procedure_note;
    if v_saved_opens = v_saved_closes then
      raise notice '--- The window is 24 hours, so nothing is refused yet. See step 5. ---';
    end if;
  else
    raise exception '--- % CHECK(S) FAILED — opening hours are NOT enforced correctly ---', v_fail;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 5. SWITCHING IT ON — read this before you do
--
-- Everything above installs the mechanism and changes nothing: the window is
-- 24 hours, so every order is still accepted, exactly as before.
--
-- The statement below is the switch. It sets the hours the shop already
-- advertises in its own header. AFTER RUNNING IT, AN ORDER PLACED OUTSIDE
-- 12:00–23:00 PAKISTAN TIME IS REFUSED — including one placed by the test
-- suite, which runs at whatever hour it is run.
--
-- Two things to decide first:
--
--   * Does the shop want late orders queued for the morning, or refused? Some
--     shops would rather take a 1am order and cook it at noon. This refuses.
--   * The `hours` text in the header is separate and stays whatever it says.
--     If you change the window, change that line too, or the shop will be
--     advertising hours it does not keep — which is the problem this file
--     exists to fix, pointing the other way.
--
-- Uncomment and run when you have decided:
--
--   update public.shop_settings
--      set opens_at = '12:00', closes_at = '23:00'
--    where id = 1;
--
-- To close for a day without touching the window:
--
--   update public.shop_settings set accepts_orders = false where id = 1;
--
-- And to reopen:
--
--   update public.shop_settings set accepts_orders = true where id = 1;
-- ---------------------------------------------------------------------------

select
  s.hours          as advertised,
  s.opens_at,
  s.closes_at,
  s.accepts_orders,
  public.shop_is_open() as taking_orders_now
from public.shop_settings s
where s.id = 1;
