-- Forno Pizza — Part 1 schema, RLS policies, and access helpers.
-- Paste into the Supabase SQL Editor and run. Safe to re-run (idempotent).
--
-- Accounts live in Supabase's built-in auth.users — there is no public.users
-- table. orders.user_id references auth.users(id); NULL means a guest order.

-- ---------------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------------

create table if not exists public.menu_items (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null,
  description   text,
  image_url     text,
  is_active     boolean     not null default true,
  is_sold_out   boolean     not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.menu_item_sizes (
  id            uuid primary key default gen_random_uuid(),
  menu_item_id  uuid        not null references public.menu_items(id) on delete cascade,
  size          text        not null,
  price         numeric(10,2) not null check (price >= 0),
  sort_order    int         not null default 0,
  created_at    timestamptz not null default now(),
  unique (menu_item_id, size)
);

create table if not exists public.ingredients (
  id                   uuid primary key default gen_random_uuid(),
  name                 text        not null unique,
  unit                 text        not null,
  stock_quantity       numeric(12,3) not null default 0 check (stock_quantity >= 0),
  low_stock_threshold  numeric(12,3) not null default 0 check (low_stock_threshold >= 0),
  created_at           timestamptz not null default now()
);

-- The BOM: one row per (sellable size, ingredient) pair.
create table if not exists public.recipes (
  id                 uuid primary key default gen_random_uuid(),
  menu_item_size_id  uuid        not null references public.menu_item_sizes(id) on delete cascade,
  ingredient_id      uuid        not null references public.ingredients(id) on delete restrict,
  quantity           numeric(12,3) not null check (quantity > 0),
  created_at         timestamptz not null default now(),
  unique (menu_item_size_id, ingredient_id)
);

create sequence if not exists public.order_number_seq start 1000;

-- Pads an order number up to 4 characters but never truncates one that is
-- already longer. lpad() alone would truncate: lpad('10160', 4, '0') -> '1016',
-- which re-issues a number handed out earlier and breaks the unique index.
create or replace function public.next_order_number()
returns text
language sql
volatile
as $$
  select case when n < 10000 then lpad(n::text, 4, '0') else n::text end
  from (select nextval('public.order_number_seq') as n) s;
$$;

-- Orders are created only through public.place_order() (supabase/place_order.sql),
-- which prices them from the database. Clients have no INSERT privilege here.
-- Guests have no SELECT policy either — place_order() hands back the access
-- token once, and get_order_by_token() is the only way to read the order after.
create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  -- Short, human-readable reference shown to the customer. Guessable by design,
  -- so it is never the thing that authorises access.
  order_number     text        not null unique default public.next_order_number(),
  -- The actual secret, and the only credential a guest needs to read their order.
  access_token     uuid        not null unique default gen_random_uuid(),
  user_id          uuid        references auth.users(id) on delete set null,
  customer_name    text        not null,
  customer_phone   text        not null,
  fulfillment_type text        not null check (fulfillment_type in ('delivery','pickup')),
  delivery_address text,
  delivery_notes   text,
  status           text        not null default 'placed'
                     check (status in ('placed','preparing','out_for_delivery',
                                       'ready_for_pickup','delivered','picked_up','cancelled')),
  subtotal         numeric(10,2) not null default 0 check (subtotal >= 0),
  delivery_fee     numeric(10,2) not null default 0 check (delivery_fee >= 0),
  tax              numeric(10,2) not null default 0 check (tax >= 0),
  total            numeric(10,2) not null default 0 check (total >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint delivery_needs_address
    check (fulfillment_type <> 'delivery' or delivery_address is not null)
);

create index if not exists orders_user_id_idx on public.orders (user_id);

-- item_name/size_label are snapshots so past orders still read correctly after
-- the Admin edits or retires a menu item.
create table if not exists public.order_items (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid        not null references public.orders(id) on delete cascade,
  menu_item_id       uuid        not null references public.menu_items(id) on delete restrict,
  menu_item_size_id  uuid        not null references public.menu_item_sizes(id) on delete restrict,
  item_name          text        not null,
  size_label         text        not null,
  quantity           int         not null check (quantity > 0),
  unit_price         numeric(10,2) not null check (unit_price >= 0),
  line_total         numeric(10,2) not null check (line_total >= 0),
  created_at         timestamptz not null default now()
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);

create table if not exists public.order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid        not null references public.orders(id) on delete cascade,
  status      text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists order_status_history_order_id_idx on public.order_status_history (order_id);

-- menu_item_id NULL = a review of the overall order/delivery experience.
create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid        not null references public.orders(id) on delete cascade,
  menu_item_id  uuid        references public.menu_items(id) on delete cascade,
  user_id       uuid        references auth.users(id) on delete set null,
  rating        int         not null check (rating between 1 and 5),
  comment       text,
  created_at    timestamptz not null default now()
);

create unique index if not exists reviews_one_per_item_per_order
  on public.reviews (order_id, menu_item_id) where menu_item_id is not null;
create unique index if not exists reviews_one_experience_per_order
  on public.reviews (order_id) where menu_item_id is null;
create index if not exists reviews_menu_item_id_idx on public.reviews (menu_item_id);

create table if not exists public.stock_alerts (
  id                uuid primary key default gen_random_uuid(),
  ingredient_id     uuid        not null references public.ingredients(id) on delete cascade,
  stock_at_trigger  numeric(12,3) not null,
  triggered_at      timestamptz not null default now(),
  resolved_at       timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists stock_alerts_ingredient_id_idx on public.stock_alerts (ingredient_id);

-- ---------------------------------------------------------------------------
-- TRIGGERS
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_orders_touch_updated_at on public.orders;
create trigger trg_orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

-- Keeps order_status_history authoritative without the client ever writing to it.
create or replace function public.log_order_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_status_history (order_id, status) values (new.id, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_log_status on public.orders;
create trigger trg_orders_log_status
  after insert or update of status on public.orders
  for each row execute function public.log_order_status();

-- ---------------------------------------------------------------------------
-- ACCESS HELPERS
--
-- RLS policies that reference another table are still subject to that table's
-- own RLS. orders has no SELECT policy for anon, so an inline EXISTS check on
-- orders would always be false for a guest. These SECURITY DEFINER helpers do
-- the ownership check instead.
-- ---------------------------------------------------------------------------

-- Unused by any policy since Part 2 moved order creation into place_order();
-- kept for Part 3, where cancelling an order needs the same ownership test.
create or replace function public.can_write_order(p_order_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and o.status = 'placed'
      and (o.user_id = auth.uid() or (o.user_id is null and auth.uid() is null))
  );
$$;

-- can_review() used to live here, called by the reviews INSERT policy. Both are
-- gone: see the reviews note further down, and supabase/reviews.sql.

-- The only way a guest reads their own order back: the unguessable token the
-- client generated at creation. No SELECT policy on orders is opened for anon.
create or replace function public.get_order_by_token(p_access_token uuid)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'order', to_jsonb(o) - 'access_token' - 'stock_deducted',
    'items', coalesce((
      select jsonb_agg(to_jsonb(oi) order by oi.created_at)
      from public.order_items oi where oi.order_id = o.id
    ), '[]'::jsonb),
    'status_history', coalesce((
      select jsonb_agg(jsonb_build_object('status', h.status, 'created_at', h.created_at) order by h.created_at)
      from public.order_status_history h where h.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  where o.access_token = p_access_token;
$$;

grant execute on function public.get_order_by_token(uuid)       to anon, authenticated;
grant execute on function public.can_write_order(uuid)          to anon, authenticated;


-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

alter table public.menu_items           enable row level security;
alter table public.menu_item_sizes      enable row level security;
alter table public.ingredients          enable row level security;
alter table public.recipes              enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.order_status_history enable row level security;
alter table public.reviews              enable row level security;
alter table public.stock_alerts         enable row level security;

-- Menu: readable by anyone, active items only.
drop policy if exists menu_items_public_read on public.menu_items;
create policy menu_items_public_read on public.menu_items
  for select to anon, authenticated
  using (is_active = true);

drop policy if exists menu_item_sizes_public_read on public.menu_item_sizes;
create policy menu_item_sizes_public_read on public.menu_item_sizes
  for select to anon, authenticated
  using (exists (
    select 1 from public.menu_items m
    where m.id = menu_item_sizes.menu_item_id and m.is_active = true
  ));

-- Orders: no INSERT policy and no INSERT grant for any client role. Writes go
-- through place_order(), which sets status, user_id and every price itself.
-- These drops matter on a database that ran an earlier version of this file —
-- re-running schema.sql must close the old path, not reopen it.
drop policy if exists orders_insert      on public.orders;
drop policy if exists order_items_insert on public.order_items;

-- No SELECT policy for anon either; guests read their order back through
-- get_order_by_token() instead.
drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists order_items_select_own on public.order_items;
create policy order_items_select_own on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and o.user_id = auth.uid()
  ));

-- Status history is written only by the trigger; customers read their own.
drop policy if exists order_status_history_select_own on public.order_status_history;
create policy order_status_history_select_own on public.order_status_history
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_status_history.order_id and o.user_id = auth.uid()
  ));

-- Reviews: no policy at all, for either direction. Part 3 moved both reading
-- and writing behind functions in supabase/reviews.sql.
--
-- The policy that used to live here allowed a direct INSERT guarded by
-- can_review(), whose guest branch — `o.user_id is null and auth.uid() is null`
-- — was true for every anonymous visitor against every guest order. Holding an
-- order id was enough to review a stranger's dinner. The SELECT policy was
-- world-readable over a table carrying order_id and user_id, which is enough to
-- tie reviews to an account and to each other.
--
-- These drops matter on a database that ran the earlier version of this file:
-- re-running schema.sql has to close that path, not reopen it.
drop policy if exists reviews_public_read on public.reviews;
drop policy if exists reviews_insert      on public.reviews;

-- ---------------------------------------------------------------------------
-- TABLE GRANTS
--
-- RLS only narrows what a role can already reach. Without a GRANT, Postgres
-- refuses at the privilege layer first and the policies never run — so the two
-- have to agree. Granting the minimum that each policy needs means a mistake in
-- a policy still can't expose a table nobody was granted in the first place.
-- ---------------------------------------------------------------------------

grant select on public.menu_items      to anon, authenticated;
grant select on public.menu_item_sizes to anon, authenticated;

-- Customers read their own orders; nobody writes one except place_order(),
-- which is SECURITY DEFINER and so needs no grant of its own. The revokes are
-- here so that re-running this file on a database set up under Part 1 takes the
-- old privilege away rather than leaving it behind.
revoke insert  on public.orders      from anon, authenticated;
revoke insert  on public.order_items from anon, authenticated;
revoke usage   on sequence public.order_number_seq from anon, authenticated;
revoke execute on function public.next_order_number() from public;
revoke execute on function public.next_order_number() from anon, authenticated;

grant  select  on public.orders      to authenticated;
grant  select  on public.order_items to authenticated;

grant select on public.order_status_history to authenticated;

-- Reviews are read and written only through the functions in reviews.sql, which
-- are SECURITY DEFINER and need no grant of their own.
revoke select, insert on public.reviews from anon, authenticated;

-- ingredients, recipes and stock_alerts get NO grant and NO policy: denied at
-- both layers for every customer-side role. Manager / Admin access is added
-- deliberately in Part 4.
