import { describe, it, expect, beforeAll } from 'vitest'
import { anonClient, signedInClient, placeOrderOrThrow, FIXTURES } from './helpers/supabase.js'

// FR-3.4: a logged-in customer can see their past orders.
//
// The page runs exactly one query — select('*, order_items(*)') with no user
// filter — and trusts RLS to decide which rows come back. These tests exercise
// that same query shape, because an embed that ignored the policy on the joined
// table would hand one customer another's food, name and address.

describe('order history for a signed-in customer', () => {
  let alice
  let bob
  let aliceId
  let bobId
  let aliceOrder
  let bobOrder
  let guestOrder

  /** The query the Orders page actually makes. */
  const history = (client) =>
    client.from('orders').select('*, order_items(*)').order('created_at', { ascending: false })

  beforeAll(async () => {
    ;({ client: alice, userId: aliceId } = await signedInClient(process.env.TEST_USER_A_EMAIL))
    ;({ client: bob, userId: bobId } = await signedInClient(process.env.TEST_USER_B_EMAIL))

    aliceOrder = await placeOrderOrThrow(alice, {
      name: 'Alice Test',
      fulfillmentType: 'pickup',
      address: null,
    })

    // A second, later order so "newest first" has something to be wrong about.
    aliceOrder = await placeOrderOrThrow(
      alice,
      { name: 'Alice Test', fulfillmentType: 'pickup', address: null },
      [{ size_id: FIXTURES.sizeLargeId, quantity: 2 }],
    )

    bobOrder = await placeOrderOrThrow(bob, {
      name: 'Integration Test',
      fulfillmentType: 'pickup',
      address: null,
    })

    guestOrder = await placeOrderOrThrow(anonClient(), {
      name: 'Passing Guest',
      fulfillmentType: 'pickup',
      address: null,
    })
  })

  it('returns alice her orders', async () => {
    const { data, error } = await history(alice)

    expect(error).toBeNull()
    expect(data.some((o) => o.id === aliceOrder.order.id)).toBe(true)
  })

  it('every order in the list belongs to alice', async () => {
    const { data } = await history(alice)

    expect(data.every((o) => o.user_id === aliceId)).toBe(true)
  })

  it('bob order is absent from alice history', async () => {
    const { data } = await history(alice)

    expect(data.every((o) => o.id !== bobOrder.order.id)).toBe(true)
  })

  it('guest orders are absent from alice history', async () => {
    // They have no user_id, so there is nothing to match them to an account.
    const { data } = await history(alice)

    expect(data.every((o) => o.id !== guestOrder.order.id)).toBe(true)
  })

  it('each order carries its own line items', async () => {
    const { data } = await history(alice)
    const found = data.find((o) => o.id === aliceOrder.order.id)

    expect(found.order_items.length).toBe(1)
    expect(found.order_items[0].size_label).toBe('Large')
    expect(found.order_items[0].quantity).toBe(2)
  })

  it('the embedded items never include another customer line', async () => {
    // The dangerous failure: RLS scoping the orders but not the embed.
    const { data } = await history(alice)
    const bobItemIds = bobOrder.items.map((i) => i.id)
    const allItemIds = data.flatMap((o) => o.order_items.map((i) => i.id))

    expect(allItemIds.some((id) => bobItemIds.includes(id))).toBe(false)
  })

  it('every embedded item belongs to the order carrying it', async () => {
    const { data } = await history(alice)

    for (const order of data) {
      for (const item of order.order_items) {
        expect(item.order_id).toBe(order.id)
      }
    }
  })

  it('newest first', async () => {
    const { data } = await history(alice)
    const times = data.map((o) => new Date(o.created_at).getTime())

    expect([...times].sort((a, b) => b - a)).toEqual(times)
  })

  it('the stored total survives the round trip', async () => {
    const { data } = await history(alice)
    const found = data.find((o) => o.id === aliceOrder.order.id)

    expect(Number(found.total)).toBe(Number(aliceOrder.order.total))
    expect(Number(found.total)).toBe(
      found.order_items.reduce((sum, i) => sum + Number(i.line_total), 0) +
        Number(found.delivery_fee),
    )
  })

  it('a customer own tracking token comes back, so history can link to it', async () => {
    // Their own credential, for their own order — this is the one place it is
    // legitimately read from the table rather than stripped.
    const { data } = await history(alice)
    const found = data.find((o) => o.id === aliceOrder.order.id)

    expect(found.access_token).toBeTruthy()
  })

  it('bob sees his own order and not alice', async () => {
    const { data } = await history(bob)

    expect(data.every((o) => o.user_id === bobId)).toBe(true)
    expect(data.some((o) => o.id === bobOrder.order.id)).toBe(true)
    expect(data.every((o) => o.id !== aliceOrder.order.id)).toBe(true)
  })

  it('a signed-out visitor gets no history at all', async () => {
    const { data, error } = await history(anonClient())

    // Denied by the missing SELECT grant for anon, or an empty set — either way
    // there is no history without a session.
    expect(error !== null || (data ?? []).length === 0).toBe(true)
  })

  it('signing out empties the history', async () => {
    const { client } = await signedInClient(process.env.TEST_USER_A_EMAIL)
    await client.auth.signOut()

    const { data, error } = await history(client)

    expect(error !== null || (data ?? []).length === 0).toBe(true)
  })
})

// Checkout prefills a signed-in customer's name, phone and address from their
// last order. That is convenient when it is their own data and a serious leak
// when it is not, so the boundary gets the same treatment as the history list.
describe('the details checkout prefills from', () => {
  const savedDetails = (client) =>
    client
      .from('orders')
      .select('customer_name, customer_phone, delivery_address')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

  it('a guest has nothing to prefill from', async () => {
    const { data, error } = await savedDetails(anonClient())

    expect(error !== null || data === null).toBe(true)
  })

  it('a signed-in customer gets their own last order back', async () => {
    const { client } = await signedInClient(process.env.TEST_USER_A_EMAIL)
    const placed = await placeOrderOrThrow(client, {
      name: 'Alice Test',
      fulfillmentType: 'delivery',
      address: 'House 77, Street 7, F-7/7, Islamabad',
    })

    const { data } = await savedDetails(client)

    expect(data.customer_name).toBe('Alice Test')
    expect(data.customer_phone).toBe(placed.order.customer_phone)
    expect(data.delivery_address).toBe('House 77, Street 7, F-7/7, Islamabad')
  })

  it('one customer is never prefilled with another address', async () => {
    // The whole risk of this feature in one assertion.
    const { client: alice } = await signedInClient(process.env.TEST_USER_A_EMAIL)
    const { client: bob } = await signedInClient(process.env.TEST_USER_B_EMAIL)

    await placeOrderOrThrow(alice, {
      name: 'Alice Test',
      fulfillmentType: 'delivery',
      address: 'House 12, Alice Street, F-6/1, Islamabad',
    })
    await placeOrderOrThrow(bob, {
      name: 'Integration Test',
      fulfillmentType: 'pickup',
      address: null,
    })

    const { data } = await savedDetails(bob)

    expect(data.delivery_address).not.toBe('House 12, Alice Street, F-6/1, Islamabad')
    expect(data.customer_name).not.toBe('Alice Test')
  })

  it('a signed-out client gets nothing even after signing out mid-session', async () => {
    const { client } = await signedInClient(process.env.TEST_USER_A_EMAIL)
    await client.auth.signOut()

    const { data, error } = await savedDetails(client)

    expect(error !== null || data === null).toBe(true)
  })
})
