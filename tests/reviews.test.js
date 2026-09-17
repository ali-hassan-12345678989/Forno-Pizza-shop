import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { COPY } from '../src/content/copy.js'
import { MIN_RATING, MAX_RATING, MAX_COMMENT_LENGTH, RATING_SCALE } from '../src/config/reviews.js'
import { anonClient, signedInClient, placeOrderOrThrow, FIXTURES } from './helpers/supabase.js'

// Part 3, task 8. FR-4.1 to FR-4.3.
//
// A rating is only worth anything if it came from someone who actually received
// the food, so most of this file is about who may leave one.
//
// Part 1 guarded reviews with a policy calling can_review(), which ended with
// `o.user_id is null and auth.uid() is null`. That is true for EVERY anonymous
// visitor against EVERY guest order — an order id was enough to review a
// stranger's dinner. Part 3 moved writing behind submit_review(), which takes
// the access token, the same credential that reads an order back or cancels it.
//
// Whether a DELIVERED order can be reviewed end to end needs an order in a
// state only staff can reach, so that half lives in supabase/verify_reviews.sql.
// What is here is the half that matters more: everything that must be refused.

const anon = anonClient()

describe('the old direct-write path is closed', () => {
  it('a guest cannot insert a review straight into the table', async () => {
    const { error } = await anon.from('reviews').insert({
      order_id: randomUUID(),
      menu_item_id: FIXTURES.menuItemId,
      rating: 5,
      comment: 'let me in',
    })

    expect(error).not.toBeNull()
  })

  it('a signed-in customer cannot either', async () => {
    const { client } = await signedInClient(process.env.TEST_USER_A_EMAIL)
    const { error } = await client.from('reviews').insert({
      order_id: randomUUID(),
      menu_item_id: FIXTURES.menuItemId,
      rating: 5,
    })

    expect(error).not.toBeNull()
  })

  it('and cannot read the raw table, which carries order_id and user_id', async () => {
    // Those two columns are what would let somebody tie a review to an account,
    // or work out that two reviews came from the same person. The display only
    // ever needs a rating, some words, a date and a first name.
    const { error, data } = await anon.from('reviews').select('order_id, user_id, rating')

    expect(error !== null || (data ?? []).length === 0).toBe(true)
  })

  it('can_review() is gone rather than left lying around', async () => {
    // Leaving a function that answers "yes" to any guest holding an order id is
    // an invitation to wire it back up.
    const { error } = await anon.rpc('can_review', {
      p_order_id: randomUUID(),
      p_menu_item_id: null,
    })

    expect(error?.message).toMatch(/could not find the function|permission denied/i)
  })
})

describe('a review cannot be spoofed onto somebody else’s order', () => {
  let order

  beforeAll(async () => {
    order = await placeOrderOrThrow(anon, { name: 'Review Probe' })
  })

  it('refuses an order id in place of the access token', async () => {
    // The sharpest version of the old hole: a real order, a real id, and the
    // reviewer is not the person who placed it.
    const { error } = await anon.rpc('submit_review', {
      p_access_token: order.order.id,
      p_menu_item_id: null,
      p_rating: 5,
      p_comment: 'nice',
    })

    expect(error?.message).toBe('order_not_found')
  })

  it('refuses a token that belongs to nobody', async () => {
    const { error } = await anon.rpc('submit_review', {
      p_access_token: randomUUID(),
      p_menu_item_id: null,
      p_rating: 5,
      p_comment: null,
    })

    expect(error?.message).toBe('order_not_found')
  })

  it('refuses an order that has not arrived yet', async () => {
    // The order is real and the token is genuinely theirs — it simply has not
    // been delivered, so there is nothing to have an opinion about.
    const { error } = await anon.rpc('submit_review', {
      p_access_token: order.access_token,
      p_menu_item_id: null,
      p_rating: 5,
      p_comment: null,
    })

    expect(error?.message).toBe('order_not_delivered')
  })

  it('will not show one customer another customer’s reviews', async () => {
    // order_reviews() is scoped by token, so a stranger's token returns theirs
    // and never this order's.
    const { data, error } = await anon.rpc('order_reviews', {
      p_access_token: randomUUID(),
    })

    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })
})

describe('the review rules match on both sides', () => {
  // The limits exist in src/config/reviews.js AND in submit_review(), because a
  // browser cannot read a Postgres constant. So these do not test the numbers —
  // they test that the two copies AGREE. Every probe below reads its value from
  // the JavaScript constant and then asks the real database about it.
  let order

  beforeAll(async () => {
    order = await placeOrderOrThrow(anon, { name: 'Review Probe' })
  })

  /** The order is not delivered, so getting that far means validation passed. */
  const PAST_VALIDATION = 'order_not_delivered'

  const send = (rating, comment) =>
    anon.rpc('submit_review', {
      p_access_token: order.access_token,
      p_menu_item_id: null,
      p_rating: rating,
      p_comment: comment ?? null,
    })

  it(`accepts the lowest rating the UI offers (${MIN_RATING})`, async () => {
    const { error } = await send(MIN_RATING, null)
    expect(error?.message).toBe(PAST_VALIDATION)
  })

  it(`accepts the highest rating the UI offers (${MAX_RATING})`, async () => {
    const { error } = await send(MAX_RATING, null)
    expect(error?.message).toBe(PAST_VALIDATION)
  })

  it(`rejects one below the scale (${MIN_RATING - 1})`, async () => {
    const { error } = await send(MIN_RATING - 1, null)
    expect(error?.message).toBe('invalid_rating')
  })

  it(`rejects one above the scale (${MAX_RATING + 1})`, async () => {
    const { error } = await send(MAX_RATING + 1, null)
    expect(error?.message).toBe('invalid_rating')
  })

  it('rejects a missing rating', async () => {
    const { error } = await send(null, null)
    expect(error?.message).toBe('invalid_rating')
  })

  it('offers exactly the stars the database will accept', () => {
    // The visible control and the constraint have to describe the same scale,
    // or the UI shows a star nobody is allowed to pick.
    expect(RATING_SCALE[0]).toBe(MIN_RATING)
    expect(RATING_SCALE[RATING_SCALE.length - 1]).toBe(MAX_RATING)
    expect(RATING_SCALE).toHaveLength(MAX_RATING - MIN_RATING + 1)
  })

  it(`accepts a comment of exactly ${MAX_COMMENT_LENGTH}`, async () => {
    const { error } = await send(MAX_RATING, 'x'.repeat(MAX_COMMENT_LENGTH))
    expect(error?.message).toBe(PAST_VALIDATION)
  })

  it(`rejects a comment of ${MAX_COMMENT_LENGTH + 1}`, async () => {
    const { error } = await send(MAX_RATING, 'x'.repeat(MAX_COMMENT_LENGTH + 1))
    expect(error?.message).toBe('invalid_comment')
  })
})

describe('reading reviews needs no account', () => {
  it('anyone can read the reviews on a dish', async () => {
    const { data, error } = await anon.rpc('item_reviews', {
      p_menu_item_id: FIXTURES.menuItemId,
      p_limit: 20,
    })

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('what comes back carries no order or account identifiers', async () => {
    const { data } = await anon.rpc('item_reviews', {
      p_menu_item_id: FIXTURES.menuItemId,
      p_limit: 20,
    })

    for (const row of data ?? []) {
      expect(Object.keys(row).sort()).toEqual(['comment', 'created_at', 'rating', 'reviewer'])
    }
  })

  it('anyone can read the per-dish summary', async () => {
    const { data, error } = await anon.rpc('menu_review_summary')

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })
})

describe('the customer is told what happened', () => {
  it('has a message for every error submit_review can raise', () => {
    for (const code of [
      'invalid_rating',
      'invalid_comment',
      'order_not_found',
      'order_not_delivered',
      'item_not_on_order',
      'already_reviewed',
    ]) {
      expect(COPY.reviews.errors[code], `no message for "${code}"`).toBeTruthy()
    }
    expect(COPY.reviews.errors.unknown).toBeTruthy()
  })
})
