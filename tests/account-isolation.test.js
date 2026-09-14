import { describe, it, expect, beforeAll } from 'vitest'
import {
  anonClient,
  signedInClient,
  newGuestOrder,
  newOrderItem,
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

    aliceOrder = newGuestOrder({
      user_id: aliceId,
      customer_name: 'Alice Test',
      fulfillment_type: 'pickup',
      delivery_address: null,
    })

    const { error } = await alice.from('orders').insert(aliceOrder)
    if (error) throw new Error(`alice order insert failed: ${error.message}`)

    await alice.from('order_items').insert(newOrderItem(aliceOrder.id))
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
    const result = await bob
      .from('order_status_history')
      .select('*')
      .eq('order_id', aliceOrder.id)

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

  it('bob cannot place an order in alice name', async () => {
    const { error } = await bob.from('orders').insert(newGuestOrder({ user_id: aliceId }))

    expect(isWriteDenied(error)).toBe(true)
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
    const guestOrder = newGuestOrder({ customer_name: 'Passing Guest' })
    await anon.from('orders').insert(guestOrder)

    const { data } = await alice.from('orders').select('id')

    expect(data.every((o) => o.id !== guestOrder.id)).toBe(true)
  })
})
