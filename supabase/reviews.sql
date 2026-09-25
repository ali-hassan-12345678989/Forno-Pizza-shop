-- Forno Pizza — leaving and reading reviews.
--
-- RUN ORDER: after schema.sql and place_order.sql. Safe to re-run.
--
-- WHY THIS REPLACES PART 1'S ARRANGEMENT
--
-- Part 1 let clients INSERT into reviews directly, guarded by a policy calling
-- can_review(order_id, menu_item_id). That check ends with:
--
--     o.user_id = auth.uid() or (o.user_id is null and auth.uid() is null)
--
-- The second half is true for EVERY anonymous visitor against EVERY guest
-- order, because a guest order has no user_id and a guest has no auth.uid().
-- So holding an order id — which travels in payloads and logs — was enough to
-- review a stranger's dinner. Part 3's standard is explicit that review
-- submission must not be spoofable onto an order that is not yours.
--
-- So reviews are written the same way orders are cancelled: through one
-- function, with the ACCESS TOKEN as the credential. It is the thing only the
-- customer who placed the order has, and it is already what get_order_by_token()
-- and cancel_order() accept. One idea of ownership across the whole app.
--
-- Reading is a function too. The reviews table carries order_id and user_id,
-- and a world-readable table hands anyone the ability to work out which account
-- reviewed what, and which reviews came from the same person. The display only
-- ever needs a rating, some words, a date and a first name.

-- ---------------------------------------------------------------------------
-- WRITING ONE
--
-- p_menu_item_id null  -> the order/delivery experience as a whole
-- p_menu_item_id set   -> that dish, which must have actually been on the order
--
-- One of each is allowed per order; the unique indexes in schema.sql are what
-- actually enforce that, and the handler below turns the violation into
-- something a form can show.
-- ---------------------------------------------------------------------------

create or replace function public.submit_review(
  p_access_token   uuid,
  p_menu_item_id   uuid,
  p_rating         int,
  p_comment        text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order   public.orders;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_review  public.reviews;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating';
  end if;

  if v_comment is not null and char_length(v_comment) > 500 then
    raise exception 'invalid_comment';
  end if;

  -- The token is the credential. An order id proves nothing.
  select * into v_order
  from public.orders
  where access_token = p_access_token;

  if not found then
    raise exception 'order_not_found';
  end if;

  -- Only someone who actually received the food. A cancelled order, or one
  -- still in the oven, has nothing to review yet.
  if v_order.status not in ('delivered', 'picked_up') then
    raise exception 'order_not_delivered';
  end if;

  -- And for a dish review, a dish that was genuinely on the ticket.
  if p_menu_item_id is not null
     and not exists (
       select 1 from public.order_items oi
       where oi.order_id = v_order.id and oi.menu_item_id = p_menu_item_id
     ) then
    raise exception 'item_not_on_order';
  end if;

  begin
    insert into public.reviews (order_id, menu_item_id, user_id, rating, comment)
    values (v_order.id, p_menu_item_id, auth.uid(), p_rating, v_comment)
    returning * into v_review;
  exception when unique_violation then
    raise exception 'already_reviewed';
  end;

  return jsonb_build_object(
    'id', v_review.id,
    'menu_item_id', v_review.menu_item_id,
    'rating', v_review.rating,
    'comment', v_review.comment,
    'created_at', v_review.created_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- WHAT THIS CUSTOMER HAS ALREADY SAID
--
-- So the form can show a filled-in rating instead of offering to collect one
-- that will be refused as a duplicate. Token-scoped: it returns this order's
-- reviews and nobody else's.
-- ---------------------------------------------------------------------------

create or replace function public.order_reviews(p_access_token uuid)
returns table (menu_item_id uuid, rating int, comment text, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select r.menu_item_id, r.rating, r.comment, r.created_at
  from public.reviews r
  join public.orders o on o.id = r.order_id
  where o.access_token = p_access_token
  order by r.created_at;
$$;

-- ---------------------------------------------------------------------------
-- READING THEM BACK, PUBLICLY
--
-- Deliberately narrow. No order_id, no user_id — those are what would let
-- someone tie reviews to an account or to each other. A first name is what a
-- review normally carries, and the customer gave it to us to put on the order.
-- ---------------------------------------------------------------------------

create or replace function public.item_reviews(p_menu_item_id uuid, p_limit int default 20)
returns table (rating int, comment text, reviewer text, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select
    r.rating,
    r.comment,
    -- First name only. "Ali" rather than the full name on the delivery address.
    nullif(split_part(btrim(o.customer_name), ' ', 1), ''),
    r.created_at
  from public.reviews r
  join public.orders o on o.id = r.order_id
  where r.menu_item_id = p_menu_item_id
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

-- One row per dish that has been reviewed, for the stars on the menu card.
create or replace function public.menu_review_summary()
returns table (menu_item_id uuid, review_count int, average_rating numeric)
language sql
security definer
set search_path = public
stable
as $$
  select r.menu_item_id, count(*)::int, round(avg(r.rating), 1)
  from public.reviews r
  where r.menu_item_id is not null
  group by r.menu_item_id;
$$;

-- The overall experience score, for wherever the shop wants to show it.
create or replace function public.experience_summary()
returns table (review_count int, average_rating numeric)
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int, round(avg(r.rating), 1)
  from public.reviews r
  where r.menu_item_id is null;
$$;

-- ---------------------------------------------------------------------------
-- CLOSING PART 1'S PATH
--
-- Both layers, so neither is load-bearing on its own: the policy that allowed a
-- direct insert is dropped, and the privilege behind it is revoked. SELECT goes
-- too — the functions above are the only way in, and they hand back only what a
-- review is supposed to show.
-- ---------------------------------------------------------------------------

drop policy if exists reviews_insert      on public.reviews;
drop policy if exists reviews_public_read on public.reviews;

revoke insert, select on public.reviews from anon, authenticated;

-- Postgres grants EXECUTE on a new function to PUBLIC by default, so these
-- grants were decorating a door that was already open. Revoking first makes the
-- audience explicit: anon and authenticated, and nobody else. Nothing changes
-- for a real caller today — what changes is that a role added later inherits
-- nothing by accident.
revoke execute on function public.submit_review(uuid, uuid, int, text) from public;
revoke execute on function public.order_reviews(uuid)                  from public;
revoke execute on function public.item_reviews(uuid, int)              from public;
revoke execute on function public.menu_review_summary()                from public;
revoke execute on function public.experience_summary()                 from public;

grant execute on function public.submit_review(uuid, uuid, int, text) to anon, authenticated;
grant execute on function public.order_reviews(uuid)                  to anon, authenticated;
grant execute on function public.item_reviews(uuid, int)              to anon, authenticated;
grant execute on function public.menu_review_summary()                to anon, authenticated;
grant execute on function public.experience_summary()                 to anon, authenticated;

-- can_review() is what the dropped policy called. Nothing uses it now, and
-- leaving a function that answers "yes" to any guest holding an order id is an
-- invitation to wire it back up.
drop function if exists public.can_review(uuid, uuid);
