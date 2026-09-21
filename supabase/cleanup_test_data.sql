-- Forno Pizza — clears rows left behind by the integration test suite, and puts
-- back the stock those orders consumed.
-- Run in the Supabase SQL Editor whenever the orders table gets noisy.
--
-- The suite creates real orders on every run, by design: RLS can only be
-- meaningfully tested against real Postgres policies, and there is deliberately
-- no DELETE policy for customers, so the tests cannot tidy up after themselves.
-- Cleaning up is a staff action, which is exactly why it lives here.
--
-- SINCE PART 3 TASK 4 THIS ALSO MATTERS FOR STOCK.
-- Every order now draws real ingredients out of `ingredients`, and a test order
-- is indistinguishable from a real one as far as the engine is concerned — as
-- it should be, or the tests would not be testing anything. But it means a few
-- suite runs quietly eat the shop's inventory: roughly fifty orders a run, and
-- a Medium pizza is 250g of dough and 150g of mozzarella. Four or five runs
-- without a clean-up and the pizzas start refusing to be ordered at all.
--
-- So deleting the rows is not enough. The stock goes back first — but ONLY for
-- orders that actually took some. See the note above that block; getting that
-- wrong is how a test database ends up with 588kg of pizza dough.

-- ---------------------------------------------------------------------------
-- WHO COUNTS AS A TEST ORDER
-- ---------------------------------------------------------------------------

create temporary table if not exists test_orders (
  id uuid primary key,
  status text,
  stock_deducted boolean
);
delete from test_orders;

insert into test_orders (id, status, stock_deducted)
select id, status, stock_deducted from public.orders
where customer_name in (
  -- Part 1 and 2
  'Integration Test', 'Alice Test', 'Passing Guest', 'Probe',
  'Retest Guest', 'Retest Pickup', 'Probe Enter',
  -- Part 3
  'Status Probe', 'Trail Probe', 'Guard Check', 'Cancel Probe',
  'Lookup Probe', 'Recipe Check', 'Stock Check', 'Stock Probe',
  'Atomicity Check', 'Diag Probe', 'Topping Check', 'Flag Probe',
  'Race Probe', 'Alert Check', 'Sold Out Check',
  'Review Probe', 'Review Check', 'Sold Out Probe',
  -- Part 4. Browser and API probes used while building the staff panels.
  'Final QA', 'Live Smoke Test', 'Fix Probe', 'Seq Probe', 'Smoke Test'
);

-- ---------------------------------------------------------------------------
-- GIVE THE STOCK BACK
--
-- Only orders that actually took stock, and orders.stock_deducted is the only
-- thing that knows. The first version of this block used "status <> cancelled"
-- as a proxy and was badly wrong: almost every order in the table predates the
-- deduction entirely, so it refunded hundreds of orders that had never taken
-- anything. Mozzarella went up thirteenfold.
--
-- restore_order_stock() now checks the flag itself and clears it afterwards, so
-- this loop cannot over-refund even if this file is run twice in a row. The
-- filter here is only to save the round trips.
-- ---------------------------------------------------------------------------

do $$
declare
  v_id uuid;
begin
  for v_id in select id from test_orders where stock_deducted loop
    perform public.restore_order_stock(v_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- THEN DELETE THEM
-- order_items, order_item_toppings, order_status_history and reviews all
-- cascade. This has to come after the refund: once the lines are gone there is
-- no way to know what the order consumed.
-- ---------------------------------------------------------------------------

delete from public.orders where id in (select id from test_orders);

-- ---------------------------------------------------------------------------
-- WHERE THINGS STAND
-- ---------------------------------------------------------------------------

select
  i.name,
  i.unit,
  i.stock_quantity,
  i.low_stock_threshold,
  case
    when i.stock_quantity <= 0                      then '*** EMPTY ***'
    when i.stock_quantity < i.low_stock_threshold   then '*** LOW ***'
    else ''
  end as flag
from public.ingredients i
order by i.stock_quantity / nullif(i.low_stock_threshold, 0) nulls first, i.name;

-- ---------------------------------------------------------------------------
-- WHAT THIS FILE COULD NOT IDENTIFY
--
-- The name list above is maintained by hand, so it will always lag behind
-- whatever was typed into a browser last week. Anything still sitting open is
-- holding real stock, so rather than guess, this reports it and leaves the
-- decision to a person. Nothing below deletes anything.
--
-- To clear one, copy its access_token and run:
--   select public.cancel_order('<token>');
-- which unwinds it through the real refund path rather than deleting the row
-- out from under the stock it took.
-- ---------------------------------------------------------------------------

select
  o.order_number,
  o.customer_name,
  o.status,
  o.fulfillment_type,
  o.created_at::date                  as placed_on,
  (current_date - o.created_at::date) as days_old,
  o.stock_deducted,
  o.access_token
from public.orders o
where public.order_is_active(o.status, o.fulfillment_type)
order by o.created_at;
