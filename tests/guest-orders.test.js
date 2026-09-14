import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  anonClient,
  newGuestOrder,
  newOrderItem,
  isReadDenied,
  isWriteDenied,
} from './helpers/supabase.js'

// FR-1.4 / FR-3.4: a guest must be able to order with no account, and later
// find that order again — without any policy that would also hand them somebody
// else's. The whole design rests on one idea: orders are write-only to guests,
// and readable only through a token they already hold.
describe('guest checkout', () => {
  const anon = anonClient()
  const order = newGuestOrder()

  beforeAll(async () => {
    const { error } = await anon.from('orders').insert(order)
    if (error) throw new Error(`guest order insert failed: ${error.message}`)

    const { error: itemError } = await anon
      .from('order_items')
      .insert(newOrderItem(order.id))
    if (itemError) throw new Error(`order item insert failed: ${itemError.message}`)
  })

  it('a guest can place an order with no session', async () => {
    const fresh = newGuestOrder()
    const { error } = await anon.from('orders').insert(fresh)

    expect(error).toBeNull()
  })

  it('a guest can add line items to their own order', async () => {
    const { error } = await anon
      .from('order_items')
      .insert(newOrderItem(order.id, { size_label: 'Large', unit_price: 19.0, line_total: 19.0 }))

    expect(error).toBeNull()
  })

  it('orders are not listable by a guest', async () => {
    const result = await anon.from('orders').select('*')

    expect(isReadDenied(result)).toBe(true)
  })

  it('a guest cannot read back even their OWN order by id', async () => {
    // This is the point of the design: holding the id is not authorisation.
    const result = await anon.from('orders').select('*').eq('id', order.id)

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
      .eq('id', order.id)
      .select()

    expect(isWriteDenied(error) || (data ?? []).length === 0).toBe(true)
  })
})

describe('token retrieval is the only guest read path', () => {
  const anon = anonClient()
  const order = newGuestOrder()

  beforeAll(async () => {
    await anon.from('orders').insert(order)
    await anon.from('order_items').insert(newOrderItem(order.id))
  })

  it('the right token returns the order', async () => {
    const { data, error } = await anon.rpc('get_order_by_token', {
      p_access_token: order.access_token,
    })

    expect(error).toBeNull()
    expect(data.order.id).toBe(order.id)
    expect(data.order.customer_name).toBe(order.customer_name)
  })

  it('the response carries the line items', async () => {
    const { data } = await anon.rpc('get_order_by_token', {
      p_access_token: order.access_token,
    })

    expect(data.items.length).toBe(1)
    expect(data.items[0].item_name).toBe('Classic pepperoni')
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
    const other = newGuestOrder()
    await anon.from('orders').insert(other)

    const { data } = await anon.rpc('get_order_by_token', {
      p_access_token: order.access_token,
    })

    expect(data.order.id).not.toBe(other.id)
  })
})

describe('order tampering is rejected', () => {
  const anon = anonClient()

  it('an order cannot be created already marked delivered', async () => {
    // Otherwise anyone could self-promote an order and unlock reviewing.
    const { error } = await anon
      .from('orders')
      .insert(newGuestOrder({ status: 'delivered' }))

    expect(isWriteDenied(error)).toBe(true)
  })

  it('a guest cannot file an order under a real account', async () => {
    const { error } = await anon
      .from('orders')
      .insert(newGuestOrder({ user_id: randomUUID() }))

    expect(error).not.toBeNull()
  })

  it('a delivery order cannot be created without an address', async () => {
    const { address, ...noAddress } = { address: null, ...newGuestOrder() }
    delete noAddress.delivery_address

    const { error } = await anon.from('orders').insert(noAddress)

    expect(error).not.toBeNull()
  })

  it('line items cannot be attached to an order that is not yours', async () => {
    // A fabricated order id must not accept items.
    const { error } = await anon.from('order_items').insert(newOrderItem(randomUUID()))

    expect(error).not.toBeNull()
  })
})
