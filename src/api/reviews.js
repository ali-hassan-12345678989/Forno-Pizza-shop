import { supabase } from '../supabaseClient'
import { OrderError } from './orders'
import { REVIEWS_PER_ITEM } from '../config/reviews'

/**
 * Reviews.
 *
 * Every call here is a Postgres function rather than a table query, for the
 * same two reasons in both directions:
 *
 *  - Writing: the access token is the credential, exactly as it is for reading
 *    an order back or cancelling one. An order id is not proof of anything, and
 *    a review that can be attached to a stranger's order is worth nothing.
 *  - Reading: the reviews table carries order_id and user_id. Handing those to
 *    the browser would let anyone tie a review to an account, or work out that
 *    two reviews came from the same person. A rating, some words, a date and a
 *    first name is all a review has ever needed to show.
 */

/** Errors submit_review() raises. */
const REVIEW_ERRORS = {
  invalid_rating: 'invalid_rating',
  invalid_comment: 'invalid_comment',
  order_not_found: 'order_not_found',
  order_not_delivered: 'order_not_delivered',
  item_not_on_order: 'item_not_on_order',
  already_reviewed: 'already_reviewed',
}

function codeFrom(error) {
  const raw = String(error?.message ?? '').trim()
  return REVIEW_ERRORS[raw] ?? 'unknown'
}

/**
 * Leaves one review.
 *
 * @param token       the order's access token — the thing that proves it is theirs
 * @param menuItemId  null for the order/delivery experience, otherwise the dish
 */
export async function submitReview(token, menuItemId, rating, comment) {
  const { data, error } = await supabase.rpc('submit_review', {
    p_access_token: token,
    p_menu_item_id: menuItemId ?? null,
    p_rating: rating,
    p_comment: comment ?? null,
  })

  if (error) throw new OrderError(codeFrom(error), error)
  return normaliseReview(data)
}

/**
 * What this order has already been reviewed for, so the form shows a filled-in
 * rating rather than offering to collect one that would be refused.
 */
export async function fetchOrderReviews(token) {
  const { data, error } = await supabase.rpc('order_reviews', { p_access_token: token })

  if (error) throw new OrderError(codeFrom(error), error)

  return (data ?? []).map(normaliseReview)
}

/** The reviews shown on a dish. Newest first. */
export async function fetchItemReviews(menuItemId, limit = REVIEWS_PER_ITEM) {
  const { data, error } = await supabase.rpc('item_reviews', {
    p_menu_item_id: menuItemId,
    p_limit: limit,
  })

  if (error) throw new OrderError(codeFrom(error), error)

  return (data ?? []).map((row) => ({
    rating: row.rating,
    comment: row.comment,
    reviewer: row.reviewer,
    at: row.created_at,
  }))
}

/**
 * Count and average per dish, keyed by menu item id.
 *
 * A Map rather than an array because every caller wants to look one up by id
 * while rendering a card, and doing that with .find() inside a render turns a
 * menu into a quadratic scan.
 */
export async function fetchReviewSummary() {
  const { data, error } = await supabase.rpc('menu_review_summary')

  if (error) return new Map()

  return new Map(
    (data ?? []).map((row) => [
      row.menu_item_id,
      { count: row.review_count, average: Number(row.average_rating) },
    ]),
  )
}

function normaliseReview(row) {
  if (!row) return null

  return {
    id: row.id ?? null,
    menuItemId: row.menu_item_id ?? null,
    rating: row.rating,
    comment: row.comment ?? null,
    at: row.created_at,
  }
}
