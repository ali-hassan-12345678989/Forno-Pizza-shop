import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  anonClient,
  placeOrder,
  placeOrderOrThrow,
  isReadDenied,
  isWriteDenied,
} from './helpers/supabase.js'

// FR-1.4 / FR-3.4: a guest must be able to order with no account, and later
// find that order again — without any policy that would also hand them somebody
// else's. The whole design rests on one idea: orders are write-only to guests,
// and readable only through a token they already hold.
//
// How an order gets priced and validated is tested in place-order.test.js; this
// file is about what a guest can and cannot see afterwards.
describe('guest checkout', () => {
  const anon = anonClient()
  let order

  beforeAll(async () => {
    order = await placeOrderOrThrow(anon)
  })

  it('a guest can place an order with no session', async () => {
    const { error } = await placeOrder(anon)

    expect(error).toBeNull()
  })

  it('the order comes back with its line items attached', async () => {
    expect(order.items.length).toBe(1)
  })

  it('orders are not listable by a guest', async () => {
    const result = await anon.from('orders').select('*')

    expect(isReadDenied(result)).toBe(true)
  })

  it('a guest cannot read back even their OWN order by id', async () => {
    // This is the point of the design: holding the id is not authorisation.
    const result = await anon.from('orders').select('*').eq('id', order.order.id)

    expect(isReadDenied(result)).toBe(true)
  })

  it('order line items are not listable by a guest', async () => {
    const result = await anon.from('order_items').select('*')

    expect(isReadDenied(result)).toBe(true)
  })

  it('a guest cannot change an order after placing it', async () => {
    // No UPDATE policy exists, so cancellation has to go through a controlled
    // path in Part 3 rather than a client-side status write.
    const { error, data } = await anon
      .from('orders')
      .update({ status: 'delivered' })
      .eq('id', order.order.id)
      .select()

    expect(isWriteDenied(error) || (data ?? []).length === 0).toBe(true)
  })

  it('a guest cannot rewrite the total of an order they placed', async () => {
    const { error, data } = await anon
      .from('orders')
      .update({ total: 1 })
      .eq('id', order.order.id)
      .select()

    expect(isWriteDenied(error) || (data ?? []).length === 0).toBe(true)
  })
})

describe('token retrieval is the only guest read path', () => {
  const anon = anonClient()
  let order

  beforeAll(async () => {
    order = await placeOrderOrThrow(anon)
  })

  it('the right token returns the order', async () => {
    const { data, error } = await anon.rpc('get_order_by_token', {
      p_access_token: order.access_token,
    })

    expect(error).toBeNull()
    expect(data.order.id).toBe(order.order.id)
    expect(data.order.customer_name).toBe(order.order.customer_name)
  })

  it('the response carries the line items', async () => {
    const { data } = await anon.rpc('get_order_by_token', {
      p_access_token: order.access_token,
    })

    expect(data.items.length).toBe(1)
    expect(data.items[0].item_name).toBe(order.items[0].item_name)
  })

  it('the response never echoes the token back', async () => {
    // The token is the credential. Echoing it into a rendered page or a log is
    // how credentials leak, so the function strips it.
    const { data } = await anon.rpc('get_order_by_token', {
      p_access_token: order.access_token,
    })

    expect(data.order.access_token).toBeUndefined()
  })

  it('a human-readable order number comes back for display', async () => {
    const { data } = await anon.rpc('get_order_by_token', {
      p_access_token: order.access_token,
    })

    expect(data.order.order_number).toBeTruthy()
  })

  it('status history is logged automatically at placement', async () => {
    // Written by a trigger, not the client — order_status_history has no INSERT
    // policy at all, so the tracker cannot be forged from the browser.
    const { data } = await anon.rpc('get_order_by_token', {
      p_access_token: order.access_token,
    })

    expect(data.status_history.length).toBeGreaterThan(0)
    expect(data.status_history[0].status).toBe('placed')
  })

  it('a wrong token returns nothing', async () => {
    const { data } = await anon.rpc('get_order_by_token', {
      p_access_token: randomUUID(),
    })

    expect(data).toBeNull()
  })

  it('one guest cannot read another guest order with their own token', async () => {
    const other = await placeOrderOrThrow(anon)

    const { data } = await anon.rpc('get_order_by_token', {
      p_access_token: order.access_token,
    })

    expect(data.order.id).not.toBe(other.order.id)
  })

  it('the order id is not a substitute for the token', async () => {
    // Someone who saw an id over a shoulder still has nothing.
    const { data } = await anon.rpc('get_order_by_token', {
      p_access_token: order.order.id,
    })

    expect(data).toBeNull()
  })
})
