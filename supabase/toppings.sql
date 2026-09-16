-- Forno Pizza — item customisation: sizes with a "serves" label, and optional
-- extra toppings.
--
-- Requested by the shop after Part 2 was built: tapping a pizza should open a
-- detail view where the customer picks a size and adds extra toppings, rather
-- than adding straight from the card.
--
-- Run in the Supabase SQL Editor AFTER schema.sql, seed_menu.sql and
-- place_order.sql. Safe to re-run.

-- ---------------------------------------------------------------------------
-- SIZES GAIN A SERVING HINT
-- "Serves 3-4" is what makes a Large feel worth 500 rupees more than a Medium.
-- Nullable: a burger or a portion of fries has no useful serving count.
-- ---------------------------------------------------------------------------

alter table public.menu_item_sizes add column if not exists serves text;

update public.menu_item_sizes set serves = 'Serves 2'   where size = 'Medium' and serves is null;
update public.menu_item_sizes set serves = 'Serves 3-4' where size = 'Large'  and serves is null;

-- ---------------------------------------------------------------------------
-- THE TOPPING CATALOGUE
-- price 0 is meaningful, not a placeholder: some extras are genuinely free, and
-- the UI shows no "+ Rs." against those.
-- ---------------------------------------------------------------------------

create table if not exists public.toppings (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null unique,
  price       numeric(10,2) not null default 0 check (price >= 0),
  sort_order  int         not null default 0,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

-- Which items offer which extras. A join table rather than a category rule,
-- because the Manager panel in Part 4 needs to change this per item, and
-- because burgers and sides must not offer pizza toppings.
create table if not exists public.menu_item_toppings (
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  topping_id   uuid not null references public.toppings(id)   on delete cascade,
  primary key (menu_item_id, topping_id)
);

-- What was actually chosen. name and price are snapshots for the same reason
-- order_items snapshots item_name: a past order must still read correctly after
-- the Admin renames or reprices a topping.
create table if not exists public.order_item_toppings (
  id            uuid primary key default gen_random_uuid(),
  order_item_id uuid        not null references public.order_items(id) on delete cascade,
  topping_id    uuid        references public.toppings(id) on delete set null,
  name          text        not null,
  price         numeric(10,2) not null check (price >= 0),
  created_at    timestamptz not null default now()
);

create index if not exists order_item_toppings_order_item_id_idx
  on public.order_item_toppings (order_item_id);

-- ---------------------------------------------------------------------------
-- SEED
-- Prices mirror the structure the shop asked for — two premium extras, four
-- mid, three free. Names are Forno's own rather than a competitor's product
-- names ("Tex-Mex Chicken" is Domino's menu language, not a generic topping).
-- ---------------------------------------------------------------------------

insert into public.toppings (name, price, sort_order) values
  ('Extra Cheese',   249, 1),
  ('Chicken Chunks', 249, 2),
  ('Mushroom',       149, 3),
  ('Jalapeno',       149, 4),
  ('Olives',         149, 5),
  ('Pickle',         149, 6),
  ('Capsicum',         0, 7),
  ('Green Chilli',     0, 8),
  ('Onion',            0, 9)
on conflict (name) do update
  set price = excluded.price, sort_order = excluded.sort_order, is_active = true;

-- Every pizza offers every topping. Burgers and sides deliberately offer none.
insert into public.menu_item_toppings (menu_item_id, topping_id)
select mi.id, t.id
from public.menu_items mi
cross join public.toppings t
where mi.category in ('Classics', 'Signature')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

alter table public.toppings             enable row level security;
alter table public.menu_item_toppings   enable row level security;
alter table public.order_item_toppings  enable row level security;

drop policy if exists toppings_public_read on public.toppings;
create policy toppings_public_read on public.toppings
  for select to anon, authenticated
  using (is_active = true);

drop policy if exists menu_item_toppings_public_read on public.menu_item_toppings;
create policy menu_item_toppings_public_read on public.menu_item_toppings
  for select to anon, authenticated
  using (exists (
    select 1 from public.menu_items m
    where m.id = menu_item_toppings.menu_item_id and m.is_active = true
  ));

-- Chosen toppings are readable by the customer who owns the order, exactly like
-- the order_items row they hang off. Guests read theirs via get_order_by_token.
drop policy if exists order_item_toppings_select_own on public.order_item_toppings;
create policy order_item_toppings_select_own on public.order_item_toppings
  for select to authenticated
  using (exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.id = order_item_toppings.order_item_id and o.user_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- GRANTS
-- No INSERT anywhere: place_order() writes order_item_toppings as the owner,
-- so a client that could insert here could add free toppings after the fact.
-- ---------------------------------------------------------------------------

grant select on public.toppings            to anon, authenticated;
grant select on public.menu_item_toppings  to anon, authenticated;
grant select on public.order_item_toppings to authenticated;

revoke insert, update, delete on public.toppings            from anon, authenticated;
revoke insert, update, delete on public.menu_item_toppings  from anon, authenticated;
revoke insert, update, delete on public.order_item_toppings from anon, authenticated;
