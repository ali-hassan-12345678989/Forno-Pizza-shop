-- Forno Pizza — shop settings.
-- Run in the Supabase SQL Editor AFTER schema.sql. Safe to re-run.
--
-- Moves the shop's own details out of the React bundle and into the database,
-- so changing a phone number or the delivery fee is an edit, not a redeploy.
--
-- delivery_fee matters most: Part 2 requires the order total to be recomputed
-- server-side, so the Postgres function that does it and the cart that previews
-- it must read the same number. Holding it here is what makes that possible.

-- One shop, one row. The id check is what keeps it that way — without it a
-- stray insert would leave the app picking arbitrarily between two rows.
create table if not exists public.shop_settings (
  id             int primary key default 1 check (id = 1),
  name           text          not null,
  tagline        text          not null,
  phone_display  text          not null,
  phone_e164     text          not null,
  address        text          not null,
  hours          text          not null,
  delivery_eta   text          not null,
  pickup_eta     text          not null,
  delivery_fee   numeric(10,2) not null default 0 check (delivery_fee >= 0),
  updated_at     timestamptz   not null default now()
);

insert into public.shop_settings
  (id, name, tagline, phone_display, phone_e164, address, hours,
   delivery_eta, pickup_eta, delivery_fee)
values
  (1, 'Forno', 'Wood-fired pizza', '051 111 367 667', '+925111136766',
   'F-7 Markaz, Islamabad', 'Open daily 12pm – 11pm',
   '25–35 min', '15 min', 150)
on conflict (id) do nothing;

create or replace function public.touch_shop_settings()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_shop_settings_updated on public.shop_settings;
create trigger trg_shop_settings_updated
  before update on public.shop_settings
  for each row execute function public.touch_shop_settings();

-- ---------------------------------------------------------------------------
-- ACCESS
--
-- Readable by everyone: the header, footer and cart all need it before a
-- customer has done anything. Writable by nobody on the customer side — the
-- Admin panel gets a deliberate grant in Part 4.
-- ---------------------------------------------------------------------------

alter table public.shop_settings enable row level security;

drop policy if exists shop_settings_public_read on public.shop_settings;
create policy shop_settings_public_read on public.shop_settings
  for select to anon, authenticated
  using (true);

grant select on public.shop_settings to anon, authenticated;
