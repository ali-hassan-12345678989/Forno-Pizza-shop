-- ---------------------------------------------------------------------------
-- Forno Pizza — stand down orders that were left open by testing.
--
-- *** TEST DATABASE ONLY. This cancels real orders. ***
--
-- WHY THIS EXISTS SEPARATELY FROM cleanup_test_data.sql
-- That file matches a hand-maintained list of customer names, which can only
-- ever lag behind whatever was typed into a browser last week. Orders left
-- open by a forgotten probe are still holding ingredients, so the shop slowly
-- runs out of stock it never sold.
--
-- WHY IT CANCELS RATHER THAN DELETES
-- cancel_order() unwinds an order through the real refund path: it hands the
-- ingredients back and records the cancellation. Deleting the rows instead
-- would remove the order_items that say what was consumed, and the stock
-- would be gone with no record of where. Part 3 learned that the expensive
-- way - a refund with no record of a charge inflated the shop fourteenfold.
--
-- The cancellation window is a STATUS, not a clock ("before the kitchen
-- starts"), so age is no obstacle: anything still at 'placed' can be stood
-- down however long ago it was made.
-- ---------------------------------------------------------------------------

do $$
declare
  -- Only orders older than this. Protects anything placed during a live demo
  -- or a smoke test you are in the middle of running.
  c_older_than constant interval := interval '1 day';

  v_order   record;
  v_done    int := 0;
  v_skipped int := 0;
  v_failed  int := 0;
begin
  for v_order in
    select o.id, o.order_number, o.status, o.access_token, o.created_at
      from public.orders o
     where public.order_is_active(o.status, o.fulfillment_type)
       and o.created_at < now() - c_older_than
     order by o.created_at
  loop
    -- Only 'placed' orders are inside the cancellation window. Anything the
    -- kitchen has started is left alone and reported, because standing it
    -- down would refund ingredients that have genuinely been used.
    if v_order.status <> 'placed' then
      raise notice 'skipped #% (status %) - past the cancellation window',
        v_order.order_number, v_order.status;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    begin
      perform public.cancel_order(v_order.access_token);
      v_done := v_done + 1;
    exception when others then
      raise notice 'failed #%: %', v_order.order_number, sqlerrm;
      v_failed := v_failed + 1;
    end;
  end loop;

  raise notice '--- cancelled %, skipped %, failed % ---', v_done, v_skipped, v_failed;
end $$;

-- ---------------------------------------------------------------------------
-- WHERE THINGS STAND NOW
-- ---------------------------------------------------------------------------

select
  'still open' as report,
  count(*)     as orders,
  min(o.created_at)::date as oldest
from public.orders o
where public.order_is_active(o.status, o.fulfillment_type)

union all

select
  'ingredients below threshold',
  count(*),
  null
from public.ingredients i
where i.stock_quantity < i.low_stock_threshold;
