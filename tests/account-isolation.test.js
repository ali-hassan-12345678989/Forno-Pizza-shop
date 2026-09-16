import { describe, it, expect, beforeAll } from 'vitest'
import {
  anonClient,
  signedInClient,
  placeOrderOrThrow,
  isReadDenied,
  isWriteDenied,
} from './helpers/supabase.js'

// FR-3.4: signed-in customers get order history. The risk that comes with it is
// one customer reading another's name, phone and address — so every assertion
// here is about the boundary between two real accounts.
describe('accounts can only ever see their own orders', () => {
  let alice
  let bob
  let aliceId
  let bobId
  let aliceOrder

  beforeAll(async () => {
    ;({ client: alice, userId: aliceId } = await signedInClient(process.env.TEST_USER_A_EMAIL))
    ;({ client: bob, userId: bobId } = await signedInClient(process.env.TEST_USER_B_EMAIL))

    // Placed through place_order(), which reads user_id from Alice's own JWT —
    // there is no way to ask for an order to be filed under a chosen account.
    const placed = await placeOrderOrThrow(alice, {
      name: 'Alice Test',
      fulfillmentType: 'pickup',
      address: null,
    })

    aliceOrder = { id: placed.order.id, user_id: placed.order.user_id }
  })

  it('the two test accounts are genuinely different users', async () => {
    expect(aliceId).not.toBe(bobId)
  })

  it('alice sees her own order in her history', async () => {
    const { data, error } = await alice.from('orders').select('id, user_id')

    expect(error).toBeNull()
    expect(data.some((o) => o.id === aliceOrder.id)).toBe(true)
  })

  it('every order alice can see belongs to alice', async () => {
    const { data } = await alice.from('orders').select('user_id')

    expect(data.every((o) => o.user_id === aliceId)).toBe(true)
  })

  it('bob cannot see alice orders in his history', async () => {
    const { data } = await bob.from('orders').select('id')

    expect(data.every((o) => o.id !== aliceOrder.id)).toBe(true)
  })

  it('bob cannot fetch alice order by its exact id', async () => {
    // Knowing the primary key must not be enough.
    const result = await bob.from('orders').select('*').eq('id', aliceOrder.id)

    expect(isReadDenied(result)).toBe(true)
  })

  it('bob cannot read the line items of alice order', async () => {
    const result = await bob.from('order_items').select('*').eq('order_id', aliceOrder.id)

    expect(isReadDenied(result)).toBe(true)
  })

  it('bob cannot read alice status history', async () => {
    const result = await bob.from('order_status_history').select('*').eq('order_id', aliceOrder.id)

    expect(isReadDenied(result)).toBe(true)
  })

  it('alice can read her own status history', async () => {
    const { data, error } = await alice
      .from('order_status_history')
      .select('status')
      .eq('order_id', aliceOrder.id)

    expect(error).toBeNull()
    expect(data[0].status).toBe('placed')
  })

  it('an order bob places is filed under bob, never alice', async () => {
    // place_order() takes no user_id argument at all, so misattribution is not
    // something bob can attempt — see place-order.test.js for the direct-insert
    // path being closed off entirely.
    const placed = await placeOrderOrThrow(bob, {
      fulfillmentType: 'pickup',
      address: null,
    })

    expect(placed.order.user_id).toBe(bobId)
    expect(placed.order.user_id).not.toBe(aliceId)
  })

  it('bob cannot modify alice order', async () => {
    const { error, data } = await bob
      .from('orders')
      .update({ customer_phone: '00000000000' })
      .eq('id', aliceOrder.id)
      .select()

    expect(isWriteDenied(error) || (data ?? []).length === 0).toBe(true)
  })

  it('guest orders never leak into a signed-in history', async () => {
    // A guest order has user_id NULL; the policy matches on user_id = auth.uid()
    // so a NULL must never match a real account.
    const anon = anonClient()
    const guestOrder = await placeOrderOrThrow(anon, {
      name: 'Passing Guest',
      fulfillmentType: 'pickup',
      address: null,
    })

    const { data } = await alice.from('orders').select('id')

    expect(data.every((o) => o.id !== guestOrder.order.id)).toBe(true)
  })
})
