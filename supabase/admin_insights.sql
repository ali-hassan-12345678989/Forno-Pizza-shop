-- ---------------------------------------------------------------------------
-- Forno Pizza — WHAT THE ADMIN PANEL NEEDS TO ANSWER "WHAT SHOULD I DO?"
--
-- RUN ORDER: after schema.sql, recipes.sql, toppings.sql, stock_movements.sql,
-- admin_orders.sql, admin_menu.sql, staff_roles.sql and manager_insights.sql.
-- Safe to re-run: every statement is idempotent.
-- This is the ONLY file to run for the Admin panel work.
--
-- The owner reviewed the Admin panel and asked for twenty-two things. Seven
-- were already built, four needed subsystems this shop does not have (payroll,
-- drivers, suppliers, a payment gateway) and three described a chain of stores
-- rather than this one. Eleven remain, and this file is what they stand on.
--
-- ONE COLUMN CARRIES FOUR OF THEM. `ingredients.cost_per_unit` is the only
-- thing this database has never recorded about a pizza: what the food costs.
-- Sales it knows, stock it knows, recipes it knows exactly. Add a cost per
-- gram and the same data suddenly answers cost of goods sold, what the
-- shelves are worth, the margin on every pizza, and which items are worth
-- selling. Nothing else on the list has that leverage.
--
-- NULL COST IS A REAL ANSWER, AND IS NEVER TREATED AS ZERO. An ingredient
-- nobody has priced is unknown, not free. Every figure below therefore reports
-- its own COVERAGE — how many of the ingredients behind it carry a price — so
-- a half-priced kitchen produces a number labelled as partial rather than a
-- confident understatement of what the food cost. A margin that looks generous
-- because the cheese has no price on it is worse than no margin at all.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. WHAT THE FOOD COSTS
--
-- Per unit, in the ingredient's own unit — per gram, per millilitre, per piece.
-- numeric(14,6) because a gram of dough is a fraction of a rupee and rounding
-- it to paisa before multiplying by 36,000 g of stock would lose real money.
--
-- Nullable on purpose. The shop opens knowing none of these, and a default of
-- zero would make every margin read as pure profit on day one.
-- ---------------------------------------------------------------------------

alter table public.ingredients
  add column if not exists cost_per_unit numeric(14,6);

alter table public.ingredients
  drop constraint if exists ingredients_cost_non_negative;

alter table public.ingredients
  add constraint ingredients_cost_non_negative
  check (cost_per_unit is null or cost_per_unit >= 0);

comment on column public.ingredients.cost_per_unit is
  'What one unit of this ingredient costs, in its own unit. Null means nobody '
  'has priced it yet — which is never the same as free, and every report built '
  'on this column says so.';


create or replace function public.admin_set_ingredient_cost(
  p_ingredient_id uuid,
  p_cost          numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_cost constant numeric := 1000000;
  v_name text;
begin
  -- Costs are the Admin's, not the Manager's. A Manager books deliveries in
  -- and counts shelves; what the shop pays its suppliers is a different job.
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  -- Null is allowed, and is how a price is UNSET. Without it a figure entered
  -- by mistake could only ever be corrected to another figure, never withdrawn,
  -- and "we do not know" would become unreachable once anybody guessed.
  if p_cost is not null and (p_cost < 0 or p_cost > c_max_cost) then
    raise exception 'invalid_cost';
  end if;

  update public.ingredients
     set cost_per_unit = p_cost
   where id = p_ingredient_id
  returning name into v_name;

  if not found then
    raise exception 'ingredient_not_found';
  end if;

  return jsonb_build_object('ingredient_id', p_ingredient_id, 'name', v_name, 'cost', p_cost);
end;
$$;

revoke execute on function public.admin_set_ingredient_cost(uuid, numeric) from public;
grant execute on function public.admin_set_ingredient_cost(uuid, numeric) to authenticated;


-- ---------------------------------------------------------------------------
-- 2. WHAT THE SHELVES ARE WORTH
--
-- Stock has only ever been a weight. This is the same shelf in rupees.
--
-- `priced` and `total` come back beside the value so the screen can say "of 32
-- ingredients, 19 are priced" rather than presenting a partial figure as the
-- whole. A valuation that quietly omits the cheese is not a small error.
-- ---------------------------------------------------------------------------

create or replace function public.admin_inventory_value()
returns table (
  ingredient_id uuid,
  name          text,
  unit          text,
  stock_quantity numeric,
  cost_per_unit numeric,
  value         numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  return query
    select i.id,
           i.name,
           i.unit,
           i.stock_quantity,
           i.cost_per_unit,
           -- Null, not zero, where the price is unknown. The browser renders
           -- that as "not priced" and leaves it out of the total rather than
           -- adding nothing to it and calling the total complete.
           case when i.cost_per_unit is null then null
                else round(i.stock_quantity * i.cost_per_unit, 2) end
      from public.ingredients i
     -- Most valuable first: that is the order somebody reviewing what is tied
     -- up in stock actually wants, and unpriced rows fall to the bottom where
     -- they read as the to-do list they are.
     order by (i.stock_quantity * i.cost_per_unit) desc nulls last, i.name;
end $$;

revoke execute on function public.admin_inventory_value() from public;
grant execute on function public.admin_inventory_value() to authenticated;


-- ---------------------------------------------------------------------------
-- 3. WHAT EACH PIZZA COSTS TO MAKE
--
-- The recipe is already the bill of materials and already drives real stock
-- deduction, so this is that same sum with a price attached.
--
-- `missing_costs` is the important column. A size whose recipe contains one
-- unpriced ingredient has an UNKNOWN cost, not a smaller one, and the screen
-- must refuse to draw a margin for it. Reporting the cost of the four
-- ingredients that happen to be priced would produce a confident, wrong,
-- flattering number — which is exactly the number a menu decision gets made on.
-- ---------------------------------------------------------------------------

create or replace function public.admin_menu_costs()
returns table (
  menu_item_id   uuid,
  item_name      text,
  size_id        uuid,
  size_label     text,
  price          numeric,
  food_cost      numeric,
  margin         numeric,
  margin_percent numeric,
  ingredients_in_recipe int,
  missing_costs  int,
  is_active      boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  return query
    with costed as (
      select r.menu_item_size_id                                    as size_id,
             count(*)::int                                          as lines,
             count(*) filter (where i.cost_per_unit is null)::int    as unpriced,
             sum(r.quantity * i.cost_per_unit)                       as food_cost
        from public.recipes r
        join public.ingredients i on i.id = r.ingredient_id
       group by r.menu_item_size_id
    )
    select mi.id,
           mi.name,
           ms.id,
           ms.size,
           ms.price,
           case when c.unpriced > 0 or c.lines is null then null
                else round(c.food_cost, 2) end,
           case when c.unpriced > 0 or c.lines is null then null
                else round(ms.price - c.food_cost, 2) end,
           -- Margin as a percentage OF THE PRICE, which is how a restaurant
           -- talks about it — a 70% margin means 30 paisa of every rupee went
           -- on food. Guarded against a free item, where the percentage is
           -- undefined rather than infinite.
           case when c.unpriced > 0 or c.lines is null or ms.price = 0 then null
                else round(((ms.price - c.food_cost) / ms.price) * 100, 1) end,
           coalesce(c.lines, 0),
           coalesce(c.unpriced, 0),
           mi.is_active
      from public.menu_item_sizes ms
      join public.menu_items mi on mi.id = ms.menu_item_id
      left join costed c on c.size_id = ms.id
     -- Thinnest margin first. The list exists to find what is not worth
     -- selling, and that item should not be somewhere in the middle.
     order by (case when c.unpriced > 0 or c.lines is null or ms.price = 0 then null
                    else ((ms.price - c.food_cost) / ms.price) end) asc nulls last,
              mi.name, ms.sort_order;
end $$;

revoke execute on function public.admin_menu_costs() from public;
grant execute on function public.admin_menu_costs() to authenticated;


-- ---------------------------------------------------------------------------
-- 4. COST OF GOODS SOLD, AND THE LEAK BESIDE IT
--
-- THEORETICAL is what the recipes say the food should have cost: every order
-- and cancel movement in the window, priced.
--
-- VARIANCE is what physical counting found on top of that — see
-- manager_insights.sql. Stock that left without an order to explain it, priced.
-- This is the food-cost leakage the owner asked for, and it only exists because
-- somebody counts shelves; the recipes alone can never produce it, because the
-- recipes are what the deduction was calculated from in the first place.
--
-- ACTUAL is the two together: what the shop really got through.
-- ---------------------------------------------------------------------------

create or replace function public.admin_cogs(p_from date, p_to date)
returns table (
  goods_revenue    numeric,
  theoretical_cost numeric,
  variance_cost    numeric,
  actual_cost      numeric,
  priced_ingredients int,
  total_ingredients  int,
  movements_priced   int,
  movements_total    int
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  c_shop_tz  constant text := 'Asia/Karachi';
  c_max_days constant int  := 366;
  v_from timestamptz;
  v_to   timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'invalid_range';
  end if;

  if (p_to - p_from) > c_max_days then
    raise exception 'range_too_long';
  end if;

  -- Same half-open window, cut in the same zone, as staff_usage_between() and
  -- sales_report(). Three reports that disagree about where a day ends cannot
  -- be reconciled against one another, which is the only reason to have them.
  v_from := (p_from::timestamp)     at time zone c_shop_tz;
  v_to   := ((p_to + 1)::timestamp) at time zone c_shop_tz;

  return query
    with priced as (
      select
        -- Negated: deltas are negative when stock leaves, and a cost is a
        -- positive number.
        coalesce(-sum(m.quantity_delta * i.cost_per_unit)
                 filter (where m.reason in ('order', 'cancel')
                           and i.cost_per_unit is not null), 0)::numeric as theoretical,
        coalesce(-sum(m.quantity_delta * i.cost_per_unit)
                 filter (where m.reason = 'count'
                           and i.cost_per_unit is not null), 0)::numeric as variance,
        count(*) filter (where i.cost_per_unit is not null)::int          as priced_rows,
        count(*)::int                                                     as all_rows
        from public.stock_movements m
        join public.ingredients i on i.id = m.ingredient_id
       where m.created_at >= v_from
         and m.created_at <  v_to
    ),
    coverage as (
      select count(*) filter (where cost_per_unit is not null)::int as priced,
             count(*)::int                                          as total
        from public.ingredients
    ),
    takings as (
      select coalesce(sum(o.subtotal) filter (where o.status <> 'cancelled'), 0)::numeric as goods
        from public.orders o
       where o.created_at >= v_from
         and o.created_at <  v_to
    )
    select round(t.goods, 2),
           round(p.theoretical, 2),
           round(p.variance, 2),
           round(p.theoretical + p.variance, 2),
           c.priced,
           c.total,
           p.priced_rows,
           p.all_rows
      from priced p, coverage c, takings t;
end $$;

comment on function public.admin_cogs(date, date) is
  'Food cost across a window: what the recipes say it should have been, what '
  'counting found on top of that, and the two together. Reports its own '
  'coverage, because a figure built on half-priced ingredients is not a figure.';

revoke execute on function public.admin_cogs(date, date) from public;
grant execute on function public.admin_cogs(date, date) to authenticated;


-- ---------------------------------------------------------------------------
-- 5. THE PRODUCT MIX
--
-- Volume and margin for every item sold in the window. The four-way
-- classification the owner named — stars, plowhorses, puzzles and dogs — is a
-- comparison of each item against the median of the others, and that is done in
-- the browser (lib/productMix.js) where it can be tested without a database.
-- What comes out of here is only the measurements.
-- ---------------------------------------------------------------------------

create or replace function public.admin_product_mix(p_days int default 30)
returns table (
  menu_item_id uuid,
  item_name    text,
  qty_sold     bigint,
  revenue      numeric,
  food_cost    numeric,
  margin       numeric,
  costs_known  boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  c_shop_tz  constant text := 'Asia/Karachi';
  c_max_days constant int  := 366;
  v_days int;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  v_days := coalesce(p_days, 30);
  if v_days < 1 or v_days > c_max_days then
    raise exception 'invalid_range';
  end if;

  return query
    with size_cost as (
      select r.menu_item_size_id                                 as size_id,
             sum(r.quantity * i.cost_per_unit)                   as cost,
             bool_and(i.cost_per_unit is not null)               as known
        from public.recipes r
        join public.ingredients i on i.id = r.ingredient_id
       group by r.menu_item_size_id
    ),
    sold as (
      select oi.menu_item_id,
             (array_agg(oi.item_name order by oi.created_at desc))[1]::text as item_name,
             sum(oi.quantity)::bigint                                       as qty,
             sum(oi.line_total)::numeric                                    as revenue,
             sum(oi.quantity * sc.cost)                                     as cost,
             -- False if ANY line sold had an unpriced ingredient behind it.
             -- A mix built on partial costs would rank items by how completely
             -- they happen to be priced rather than by how profitable they are.
             coalesce(bool_and(sc.known), false)                            as known
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        left join size_cost sc on sc.size_id = oi.menu_item_size_id
       where o.status <> 'cancelled'
         and (o.created_at at time zone c_shop_tz)::date
           > (now()        at time zone c_shop_tz)::date - v_days
       group by oi.menu_item_id
    )
    select s.menu_item_id,
           s.item_name,
           s.qty,
           round(s.revenue, 2),
           case when s.known then round(s.cost, 2) else null end,
           case when s.known then round(s.revenue - s.cost, 2) else null end,
           s.known
      from sold s
     order by s.qty desc, s.revenue desc;
end $$;

revoke execute on function public.admin_product_mix(int) from public;
grant execute on function public.admin_product_mix(int) to authenticated;


-- ---------------------------------------------------------------------------
-- 6. HOW LONG ORDERS ACTUALLY TAKE
--
-- Straight out of order_status_history, which has been stamping every
-- transition since Part 3 and which nothing has ever read for this.
--
-- The owner asked for make, bake, rack and transit. This kitchen has no such
-- stations — the ladder is placed, preparing, out or ready, then delivered or
-- picked up — so what comes back is the three spans that genuinely exist,
-- named for what they are. Inventing a four-way split over a three-stage ladder
-- would be four numbers where three were measured.
--
-- MEDIAN AS WELL AS MEAN, and the median leads. One order forgotten overnight
-- drags a mean into uselessness, and a kitchen's worst day is exactly when
-- somebody looks at this.
-- ---------------------------------------------------------------------------

create or replace function public.admin_fulfillment_times(p_days int default 30)
returns table (
  stage        text,
  sort_order   int,
  orders_timed bigint,
  median_seconds numeric,
  mean_seconds   numeric,
  worst_seconds  numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  c_shop_tz  constant text := 'Asia/Karachi';
  c_max_days constant int  := 366;
  v_days int;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  v_days := coalesce(p_days, 30);
  if v_days < 1 or v_days > c_max_days then
    raise exception 'invalid_range';
  end if;

  return query
    with stamps as (
      select h.order_id,
             -- The FIRST time each status was reached. A status cannot be
             -- revisited today (set_order_status is forward-only), but reading
             -- min() means a future rule that allows it cannot silently turn
             -- these durations negative.
             min(h.created_at) filter (where h.status = 'placed')           as placed,
             min(h.created_at) filter (where h.status = 'preparing')        as preparing,
             min(h.created_at) filter (where h.status in ('out_for_delivery',
                                                          'ready_for_pickup')) as ready,
             min(h.created_at) filter (where h.status in ('delivered',
                                                          'picked_up'))        as done
        from public.order_status_history h
        join public.orders o on o.id = h.order_id
       where o.status <> 'cancelled'
         and (o.created_at at time zone c_shop_tz)::date
           > (now()        at time zone c_shop_tz)::date - v_days
       group by h.order_id
    ),
    spans as (
      select 'Waiting to start'::text as stage, 1 as sort_order,
             extract(epoch from (preparing - placed))::numeric as seconds
        from stamps where placed is not null and preparing is not null
      union all
      select 'In the kitchen', 2,
             extract(epoch from (ready - preparing))::numeric
        from stamps where preparing is not null and ready is not null
      union all
      select 'Out or waiting for collection', 3,
             extract(epoch from (done - ready))::numeric
        from stamps where ready is not null and done is not null
      union all
      select 'Order to doorstep', 4,
             extract(epoch from (done - placed))::numeric
        from stamps where placed is not null and done is not null
    )
    select s.stage,
           s.sort_order,
           count(*)::bigint,
           round(percentile_cont(0.5) within group (order by s.seconds)::numeric, 0),
           round(avg(s.seconds), 0),
           round(max(s.seconds), 0)
      from spans s
     -- A clock that ran backwards is a data problem, not a fast kitchen, and
     -- averaging it in would quietly flatter every figure here.
     where s.seconds >= 0
     group by s.stage, s.sort_order
     order by s.sort_order;
end $$;

revoke execute on function public.admin_fulfillment_times(int) from public;
grant execute on function public.admin_fulfillment_times(int) to authenticated;


-- ---------------------------------------------------------------------------
-- 7. WHAT TODAY IS SUPPOSED TO LOOK LIKE
--
-- Per weekday, not per date. Trade runs on a weekly cycle — the same reason the
-- Manager's dashboard compares today against the same weekday — and a target
-- per calendar date is a spreadsheet somebody has to keep filling in forever.
-- Seven numbers, set once, revisited when the shop changes.
-- ---------------------------------------------------------------------------

create table if not exists public.sales_targets (
  -- 0 = Sunday, matching extract(dow), so nothing has to translate.
  day_of_week    int primary key check (day_of_week between 0 and 6),
  target_revenue numeric(12,2) not null check (target_revenue >= 0),
  updated_at     timestamptz not null default now()
);

comment on table public.sales_targets is
  'What each day of the week is expected to take. Seven rows at most.';

alter table public.sales_targets enable row level security;
revoke all on public.sales_targets from anon, authenticated;


create or replace function public.admin_sales_targets()
returns table (day_of_week int, target_revenue numeric, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not (public.is_admin() or public.is_manager()) then
    raise exception 'not_staff';
  end if;

  -- Every weekday comes back, target or not. A missing row means "no target
  -- set", and the screen says so — where an absent row would just look like a
  -- day the shop does not open.
  return query
    select d.dow,
           t.target_revenue,
           t.updated_at
      from generate_series(0, 6) as d(dow)
      left join public.sales_targets t on t.day_of_week = d.dow
     order by d.dow;
end $$;

revoke execute on function public.admin_sales_targets() from public;
grant execute on function public.admin_sales_targets() to authenticated;


create or replace function public.admin_set_sales_target(
  p_day_of_week int,
  p_target      numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_target constant numeric := 100000000;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  if p_day_of_week is null or p_day_of_week < 0 or p_day_of_week > 6 then
    raise exception 'invalid_day';
  end if;

  -- Null clears the target, for the same reason a null cost withdraws a price:
  -- a figure entered by mistake must be removable, not merely replaceable.
  if p_target is null then
    delete from public.sales_targets where day_of_week = p_day_of_week;
    return jsonb_build_object('day_of_week', p_day_of_week, 'target', null);
  end if;

  if p_target < 0 or p_target > c_max_target then
    raise exception 'invalid_target';
  end if;

  insert into public.sales_targets (day_of_week, target_revenue, updated_at)
  values (p_day_of_week, p_target, now())
  on conflict (day_of_week)
  do update set target_revenue = excluded.target_revenue, updated_at = now();

  return jsonb_build_object('day_of_week', p_day_of_week, 'target', p_target);
end;
$$;

revoke execute on function public.admin_set_sales_target(int, numeric) from public;
grant execute on function public.admin_set_sales_target(int, numeric) to authenticated;


-- ---------------------------------------------------------------------------
-- 8. EDITING A RECIPE
--
-- The bill of materials has driven real stock deduction since Part 3 and has
-- never had a screen. Changing how much cheese goes on a Large has meant
-- someone writing SQL, which means it has effectively never changed.
-- ---------------------------------------------------------------------------

create or replace function public.admin_recipe_for_size(p_size_id uuid)
returns table (
  ingredient_id uuid,
  name          text,
  unit          text,
  quantity      numeric,
  cost_per_unit numeric,
  line_cost     numeric,
  stock_quantity numeric
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  return query
    select i.id,
           i.name,
           i.unit,
           r.quantity,
           i.cost_per_unit,
           case when i.cost_per_unit is null then null
                else round(r.quantity * i.cost_per_unit, 4) end,
           i.stock_quantity
      from public.recipes r
      join public.ingredients i on i.id = r.ingredient_id
     where r.menu_item_size_id = p_size_id
     order by i.name;
end $$;

revoke execute on function public.admin_recipe_for_size(uuid) from public;
grant execute on function public.admin_recipe_for_size(uuid) to authenticated;


create or replace function public.admin_save_recipe_line(
  p_size_id       uuid,
  p_ingredient_id uuid,
  p_quantity      numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_quantity constant numeric := 100000;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  -- Zero is not a recipe line. An ingredient that goes on in no quantity is an
  -- ingredient that does not go on, and should be removed rather than recorded
  -- as present-but-weightless — which would also make it invisible in every
  -- cost sum while still appearing on the list.
  if p_quantity is null or p_quantity <= 0 or p_quantity > c_max_quantity then
    raise exception 'invalid_quantity';
  end if;

  if not exists (select 1 from public.menu_item_sizes where id = p_size_id) then
    raise exception 'size_not_found';
  end if;

  if not exists (select 1 from public.ingredients where id = p_ingredient_id) then
    raise exception 'ingredient_not_found';
  end if;

  insert into public.recipes (menu_item_size_id, ingredient_id, quantity)
  values (p_size_id, p_ingredient_id, p_quantity)
  on conflict (menu_item_size_id, ingredient_id)
  do update set quantity = excluded.quantity;

  return jsonb_build_object('size_id', p_size_id, 'ingredient_id', p_ingredient_id,
                            'quantity', p_quantity);
end;
$$;

revoke execute on function public.admin_save_recipe_line(uuid, uuid, numeric) from public;
grant execute on function public.admin_save_recipe_line(uuid, uuid, numeric) to authenticated;


create or replace function public.admin_delete_recipe_line(
  p_size_id       uuid,
  p_ingredient_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining int;
  v_active    boolean;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  select count(*) into v_remaining
    from public.recipes
   where menu_item_size_id = p_size_id
     and ingredient_id <> p_ingredient_id;

  select mi.is_active into v_active
    from public.menu_item_sizes ms
    join public.menu_items mi on mi.id = ms.menu_item_id
   where ms.id = p_size_id;

  -- THE GUARD THAT MATTERS. deduct_order_stock() raises 'recipe_missing' for
  -- any size with no recipe at all, and place_order() turns that into a refused
  -- order. Emptying the recipe of a size that is live on the menu would
  -- therefore take that pizza off sale silently — the item would still be
  -- listed, still be addable to a cart, and fail at the last step of checkout.
  -- Hiding the item first is one click; discovering this at 8pm is not.
  if v_remaining = 0 and coalesce(v_active, false) then
    raise exception 'would_break_ordering';
  end if;

  delete from public.recipes
   where menu_item_size_id = p_size_id
     and ingredient_id = p_ingredient_id;

  if not found then
    raise exception 'recipe_line_not_found';
  end if;

  return jsonb_build_object('size_id', p_size_id, 'ingredient_id', p_ingredient_id,
                            'remaining', v_remaining);
end;
$$;

revoke execute on function public.admin_delete_recipe_line(uuid, uuid) from public;
grant execute on function public.admin_delete_recipe_line(uuid, uuid) to authenticated;



-- ---------------------------------------------------------------------------
-- 8b. FINDING AN ORDER BY THE NUMBER THE CUSTOMER IS READING OUT
--
-- The owner asked for a search that indexes the phone number. The Admin's order
-- list has never carried one, and that is a deliberate privacy posture stated
-- in admin_orders.sql: the list shows a name and a badge, and only
-- admin_order_detail() hands over contact details for one order the Admin has
-- deliberately opened.
--
-- So the phone is matched HERE and never returned. A support call becomes
-- "type the number they gave you" while the list on screen still shows nobody's
-- contact details, and a screenshot of this page still leaks nothing.
--
-- Everything else is unchanged from admin_orders.sql. The one-argument version
-- is kept, not dropped: unlike cancel_order it has no side effects, the new
-- argument defaults to null, and a null search is byte-for-byte the old
-- behaviour — so nothing that calls it today needs to change.
-- ---------------------------------------------------------------------------

create or replace function public.admin_orders(p_limit int default 100, p_search text default null)
returns table (
  id               uuid,
  order_number     text,
  status           text,
  fulfillment_type text,
  customer_name    text,
  has_account      boolean,
  item_count       bigint,
  total            numeric,
  created_at       timestamptz,
  is_active        boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  c_max_limit constant int := 500;
  v_search text;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  if p_limit is null or p_limit <= 0 or p_limit > c_max_limit then
    raise exception 'invalid_limit';
  end if;

  -- Blank is not a search. Without this an empty box would match every order
  -- whose phone contains the empty string, which is all of them — the same
  -- answer as no search, arrived at the expensive way.
  v_search := nullif(btrim(coalesce(p_search, '')), '');

  return query
    select o.id,
           o.order_number,
           o.status,
           o.fulfillment_type,
           o.customer_name,
           o.user_id is not null,
           coalesce((
             select sum(oi.quantity)::bigint
             from public.order_items oi
             where oi.order_id = o.id
           ), 0),
           o.total,
           o.created_at,
           public.order_is_active(o.status, o.fulfillment_type)
      from public.orders o
     where (
             v_search is null
             and (
               public.order_is_active(o.status, o.fulfillment_type)
               or o.id in (
                    select r.id from public.orders r
                     order by r.created_at desc
                     limit p_limit
                  )
             )
           )
        or (
             v_search is not null
             and (
               o.order_number ilike '%' || v_search || '%'
               or o.customer_name ilike '%' || v_search || '%'
               -- Digits only on both sides, so "0300 123 4567" finds an order
               -- stored as "03001234567". A customer reading their number out
               -- does not use the shop's spacing.
               or regexp_replace(o.customer_phone, '[^0-9]', '', 'g')
                    like '%' || regexp_replace(v_search, '[^0-9]', '', 'g') || '%'
                  and regexp_replace(v_search, '[^0-9]', '', 'g') <> ''
             )
           )
     order by o.created_at desc
     limit p_limit;
end $$;

comment on function public.admin_orders(int, text) is
  'Recent orders for the Admin panel, newest first. With a search it matches '
  'order number, customer name or phone — the phone is matched but never '
  'returned, so the list still carries no contact details.';

revoke execute on function public.admin_orders(int, text) from public;
grant execute on function public.admin_orders(int, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 9. VERIFY
-- ---------------------------------------------------------------------------

do $$
declare
  v_fail int := 0;
  v_sig  text;
begin
  foreach v_sig in array array[
    'public.admin_set_ingredient_cost(uuid, numeric)',
    'public.admin_inventory_value()',
    'public.admin_menu_costs()',
    'public.admin_cogs(date, date)',
    'public.admin_product_mix(int)',
    'public.admin_fulfillment_times(int)',
    'public.admin_sales_targets()',
    'public.admin_set_sales_target(int, numeric)',
    'public.admin_recipe_for_size(uuid)',
    'public.admin_save_recipe_line(uuid, uuid, numeric)',
    'public.admin_delete_recipe_line(uuid, uuid)',
    'public.admin_orders(int, text)'
  ] loop
    if to_regprocedure(v_sig) is null then
      raise warning 'FAILED: % does not exist', v_sig;
      v_fail := v_fail + 1;
    elsif has_function_privilege('anon', v_sig, 'execute') then
      raise warning 'FAILED: anon can execute %', v_sig;
      v_fail := v_fail + 1;
    end if;
  end loop;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'ingredients'
       and column_name = 'cost_per_unit'
  ) then
    raise warning 'FAILED: ingredients.cost_per_unit is missing';
    v_fail := v_fail + 1;
  end if;

  if has_table_privilege('anon', 'public.sales_targets', 'select')
     or has_table_privilege('authenticated', 'public.sales_targets', 'select') then
    raise warning 'FAILED: sales_targets is directly readable by a client role';
    v_fail := v_fail + 1;
  end if;

  if v_fail = 0 then
    raise notice '--- admin_insights.sql is in place. 14 checks passed. ---';
    raise notice '    Nothing is priced yet: set costs in Admin -> Inventory.';
  else
    raise exception '--- % CHECK(S) FAILED ---', v_fail;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- FOR THE RECORD
-- ---------------------------------------------------------------------------

select count(*) filter (where cost_per_unit is not null) as priced,
       count(*)                                          as ingredients_total
  from public.ingredients;
