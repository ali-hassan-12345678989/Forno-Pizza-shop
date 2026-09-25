import { describe, it, expect } from 'vitest'
import { anonClient, signedInClient } from './helpers/supabase.js'

/**
 * L-4's safety net.
 *
 * Ten functions had their EXECUTE granted to anon and authenticated without
 * first revoking Postgres's default grant to PUBLIC. supabase/l4_revokes.sql
 * closes that default. Access for a real caller is meant to be completely
 * unchanged by that — and this file is what says so.
 *
 * It deliberately does NOT try to prove the revoke happened. It cannot: PUBLIC
 * losing EXECUTE is invisible from here, because anon and authenticated hold
 * their own grants either way, so every assertion below passes identically
 * before and after the file is run. Proving the revoke needs to read proacl,
 * which no client role can do, so l4_revokes.sql verifies that itself and
 * raises if it did not take.
 *
 * What this file catches is the failure that would actually hurt: a revoke
 * written against the wrong signature, or one that took a role's access with
 * it.
 */

const PERMISSION_DENIED = '42501'
const NO_SUCH_FUNCTION = /Could not find the function|does not exist/i

/**
 * Every call below is made with arguments that reach the function body and are
 * then refused by its own rules — a random token, an empty cart. A business
 * refusal proves the caller got through the door, and nothing is created on the
 * way. `place_order` in particular is called with no items on purpose: a grant
 * test has no business leaving orders behind.
 */
const CALLS = [
  ['can_write_order', { p_order_id: crypto.randomUUID() }],
  ['cancel_order', { p_access_token: crypto.randomUUID() }],
  ['experience_summary', {}],
  ['get_order_by_token', { p_access_token: crypto.randomUUID() }],
  ['item_reviews', { p_menu_item_id: crypto.randomUUID(), p_limit: 5 }],
  ['menu_review_summary', {}],
  ['order_reviews', { p_access_token: crypto.randomUUID() }],
  ['order_status_values', {}],
  [
    'place_order',
    {
      p_fulfillment_type: 'pickup',
      p_customer_name: 'Grant Check',
      p_customer_phone: '+923000000000',
      p_delivery_address: null,
      p_delivery_notes: null,
      p_items: [],
    },
  ],
  [
    'submit_review',
    {
      p_access_token: crypto.randomUUID(),
      p_menu_item_id: crypto.randomUUID(),
      p_rating: 5,
      p_comment: null,
    },
  ],
]

function expectReachable(error, who, fn) {
  // A permission error means the revoke took the grant with it.
  expect(error?.code, `${who} was refused ${fn}() by privileges, not by its own rules`).not.toBe(
    PERMISSION_DENIED,
  )
  expect(error?.message ?? '', `${who} was refused ${fn}() by privileges`).not.toMatch(
    /permission denied/i,
  )
  // And a signature error means the revoke named something that is not there,
  // which would make the assertion above pass for the wrong reason.
  expect(error?.message ?? '', `${fn}() no longer exists with that signature`).not.toMatch(
    NO_SUCH_FUNCTION,
  )
}

describe('anon can still execute all ten', () => {
  const anon = anonClient()

  it.each(CALLS)('anon: %s()', async (fn, args) => {
    const { error } = await anon.rpc(fn, args)
    expectReachable(error, 'anon', fn)
  })
})

describe('authenticated can still execute all ten', () => {
  // One session for the whole block. Supabase rate-limits authentication, and
  // signing in once per case would trip it and report the refusal as a grant
  // failure — the suite has been bitten by that before.
  const session = signedInClient(process.env.TEST_USER_A_EMAIL)

  it.each(CALLS)('authenticated: %s()', async (fn, args) => {
    const { client } = await session
    const { error } = await client.rpc(fn, args)
    expectReachable(error, 'authenticated', fn)
  })
})

describe('the grant test is not passing vacuously', () => {
  // If a function that nobody was ever granted came back reachable, the
  // assertions above would be measuring nothing.
  it('a function anon was never granted is still refused', async () => {
    const anon = anonClient()
    const { error } = await anon.rpc('next_order_number')

    expect(error).toBeTruthy()
    expect(
      error.code === PERMISSION_DENIED || NO_SUCH_FUNCTION.test(error.message),
      `expected next_order_number() to be out of reach, got: ${error.message}`,
    ).toBe(true)
  })
})
