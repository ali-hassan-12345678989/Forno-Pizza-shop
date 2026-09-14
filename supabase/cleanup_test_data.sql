-- Forno Pizza — clears rows left behind by the integration test suite.
-- Run in the Supabase SQL Editor whenever the orders table gets noisy.
--
-- The suite creates real orders on every run, by design: RLS can only be
-- meaningfully tested against real Postgres policies, and there is deliberately
-- no DELETE policy for customers, so the tests cannot tidy up after themselves.
-- Cleaning up is a staff action, which is exactly why it lives here.

-- order_items, order_status_history and reviews all cascade from orders.
delete from public.orders
where customer_name in ('Integration Test', 'Alice Test', 'Passing Guest');

-- What's left should only be orders you placed by hand.
select order_number, customer_name, status, created_at
from public.orders
order by created_at desc;
