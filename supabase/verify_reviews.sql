-- Forno Pizza — proving a delivered order can actually be reviewed.
--
-- Run in the Supabase SQL Editor: paste the whole file, run it once, read the
-- verdict row at the top. Every row should say "ok".
--
-- RUN ORDER: after reviews.sql.
--
-- WHY THIS FILE EXISTS
-- tests/reviews.test.js runs on the anon key, which cannot move an order to
-- 'delivered' — advancing an order is staff-only, deliberately. So it can prove
-- every refusal and none of the acceptances. Everything that should WORK is
-- checked here, from a session allowed to deliver an order.
--
-- Leaves nothing behind: the orders, reviews and stock it touches are all put
-- back at the end.

drop table if exists review_check_results;
create temporary table review_check_results (seq serial, check_name text, result text);

create or replace function pg_temp.expect_error(p_sql text, p_code text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return format('FAIL — expected %s, but it was allowed', p_code);
exception when others then
  if sqlerrm = p_code then return format('ok — refused with %s', p_code); end if;
  return format('FAIL — expected %s, got "%s"', p_code, sqlerrm);
end;
$$;

do $$
declare
  v_tikka_m  uuid;
  v_tikka_it uuid;
  v_marg_m   uuid;
  v_marg_it  uuid;
  v_order    uuid;
  v_token    uuid;
  v_other    uuid;
  v_phone    text;
  v_rows     int;
  v_avg      numeric;
  v_id       uuid;
begin
  select ms.id, mi.id into v_tikka_m, v_tikka_it
  from public.menu_item_sizes ms join public.menu_items mi on mi.id = ms.menu_item_id
  where mi.name = 'Chicken Tikka' and ms.size = 'Medium';

  select ms.id, mi.id into v_marg_m, v_marg_it
  from public.menu_item_sizes ms join public.menu_items mi on mi.id = ms.menu_item_id
  where mi.name = 'Margherita' and ms.size = 'Medium';

  -- An order containing ONLY Chicken Tikka, taken all the way to delivered.
  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');
  select (public.place_order(
    'pickup', 'Review Check', v_phone, null, null,
    jsonb_build_array(jsonb_build_object('size_id', v_tikka_m, 'quantity', 1))
  ) -> 'order' ->> 'id')::uuid into v_order;

  select access_token into v_token from public.orders where id = v_order;

  -- --- before it arrives ----------------------------------------------------

  insert into review_check_results (check_name, result) values
    ('an order still being made cannot be reviewed',
     pg_temp.expect_error(
       format('select public.submit_review(%L, null, 5, null)', v_token),
       'order_not_delivered'));

  perform public.set_order_status(v_order, 'picked_up');

  -- --- after it arrives -----------------------------------------------------

  begin
    perform public.submit_review(v_token, null, 5, 'Quick and hot.');
    insert into review_check_results (check_name, result)
    values ('a delivered order can be reviewed', 'ok — experience review accepted');
  exception when others then
    insert into review_check_results (check_name, result)
    values ('a delivered order can be reviewed', format('FAIL — %s', sqlerrm));
  end;

  begin
    perform public.submit_review(v_token, v_tikka_it, 4, 'Good, a bit spicy.');
    insert into review_check_results (check_name, result)
    values ('and so can a dish that was on it', 'ok — item review accepted');
  exception when others then
    insert into review_check_results (check_name, result)
    values ('and so can a dish that was on it', format('FAIL — %s', sqlerrm));
  end;

  -- --- what must still be refused -------------------------------------------

  insert into review_check_results (check_name, result) values
    ('a dish that was NOT on the order is refused',
     pg_temp.expect_error(
       format('select public.submit_review(%L, %L, 5, null)', v_token, v_marg_it),
       'item_not_on_order'));

  insert into review_check_results (check_name, result) values
    ('the same dish cannot be reviewed twice',
     pg_temp.expect_error(
       format('select public.submit_review(%L, %L, 1, null)', v_token, v_tikka_it),
       'already_reviewed'));

  insert into review_check_results (check_name, result) values
    ('nor the experience twice',
     pg_temp.expect_error(
       format('select public.submit_review(%L, null, 1, null)', v_token),
       'already_reviewed'));

  -- --- what the customer sees back ------------------------------------------

  select count(*) into v_rows from public.order_reviews(v_token);

  insert into review_check_results (check_name, result) values
    ('the customer can read their own two reviews back',
     case when v_rows = 2 then 'ok'
          else format('FAIL — order_reviews returned %s rows, expected 2', v_rows) end);

  -- A second, unrelated order. Its token must show its own reviews and nothing
  -- of the first order's.
  v_phone := '03' || lpad((random() * 999999999)::bigint::text, 9, '0');
  select (public.place_order(
    'pickup', 'Review Check', v_phone, null, null,
    jsonb_build_array(jsonb_build_object('size_id', v_tikka_m, 'quantity', 1))
  ) -> 'order' ->> 'id')::uuid into v_other;

  select count(*) into v_rows
  from public.order_reviews((select access_token from public.orders where id = v_other));

  insert into review_check_results (check_name, result) values
    ('one order''s token shows nothing of another''s',
     case when v_rows = 0 then 'ok'
          else format('FAIL — a stranger''s token returned %s reviews', v_rows) end);

  -- --- what the public sees -------------------------------------------------

  select count(*) into v_rows from public.item_reviews(v_tikka_it, 20);

  insert into review_check_results (check_name, result) values
    ('the dish review shows up publicly',
     case when v_rows >= 1 then 'ok'
          else 'FAIL — the review is not visible on the dish' end);

  insert into review_check_results (check_name, result) values
    ('but the experience review does not appear under a dish',
     case when not exists (
            select 1 from public.item_reviews(v_tikka_it, 50)
            where comment = 'Quick and hot.')
          then 'ok — it belongs to the order, not to a pizza'
          else 'FAIL — the order-wide review is showing as a dish review' end);

  insert into review_check_results (check_name, result) values
    ('a first name only, never the full one',
     case when (select reviewer from public.item_reviews(v_tikka_it, 1)) = 'Review'
          then 'ok — "Review", not "Review Check"'
          else format('FAIL — reviewer came back as "%s"',
                      (select reviewer from public.item_reviews(v_tikka_it, 1))) end);

  select average_rating into v_avg
  from public.menu_review_summary() where menu_item_id = v_tikka_it;

  insert into review_check_results (check_name, result) values
    ('the summary averages the dish',
     case when v_avg is not null then format('ok — %s', v_avg)
          else 'FAIL — no summary row for a dish that has a review' end);

  -- --- tidy up ---------------------------------------------------------------
  -- Reviews cascade from orders. Stock has to be handed back explicitly.

  for v_id in select id from public.orders where customer_name = 'Review Check' loop
    perform public.restore_order_stock(v_id);
  end loop;

  delete from public.orders where customer_name = 'Review Check';

  insert into review_check_results (check_name, result) values
    ('test orders and their reviews removed',
     case when not exists (select 1 from public.orders where customer_name = 'Review Check')
          then 'ok — nothing left behind'
          else 'FAIL — test orders are still there' end);
end;
$$;

select
  0 as seq,
  case when count(*) filter (where result like 'FAIL%') = 0
       then format('*** ALL %s CHECKS PASSED ***', count(*))
       else format('*** %s OF %s FAILED — see the rows below ***',
                   count(*) filter (where result like 'FAIL%'), count(*))
  end as check_name,
  case when count(*) filter (where result like 'FAIL%') = 0
       then 'nothing to do'
       else string_agg(check_name, '; ') filter (where result like 'FAIL%')
  end as result
from review_check_results

union all

select seq, check_name, result from review_check_results
order by seq;
