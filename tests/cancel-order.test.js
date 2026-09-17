import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { ORDER_STATUS } from '../src/config/orderStatus.js'
import { COPY } from '../src/content/copy.js'
import { anonClient, signedInClient, placeOrderOrThrow } from './helpers/supabase.js'

// Part 3, task 2: cancelling, and the window it is allowed in.
//
// The rule is a stage, not a clock: an order can be called off until the
// kitchen starts it. What matters most here is WHO may do it — cancel_order()
// takes the access token rather than the order id, because an id is not proof
// of anything. Half of this file is about that.

const anon = anonClient()

/** A fresh guest order, placed and ready to be cancelled. */
async function freshOrder(overrides = {}) {
  return placeOrderOrThrow(anon, { name: 'Cancel Probe', ...overrides })
}

describe('a customer cancels their own order', () => {
  let order

  beforeAll(async () => {
    order = await freshOrder()
  })

  it('is allowed while the order is still waiting', async () => {
    const { data, error } = await anon.rpc('cancel_order', {
      p_access_token: order.access_token,
    })

    expect(error).toBeNull()
    expect(data.order.status).toBe(ORDER_STATUS.cancelled)
  })

  it('records the cancellation in the history', async () => {
    const { data } = await anon.rpc('get_order_by_token', {
      p_access_token: order.access_token,
    })

    expect(data.status_history.map((h) => h.status)).toEqual([
      ORDER_STATUS.placed,
      ORDER_STATUS.cancelled,
    ])
  })

  it('cannot be cancelled twice', async () => {
    const { error } = await anon.rpc('cancel_order', {
      p_access_token: order.access_token,
    })

    expect(error?.message).toBe('already_cancelled')
  })

  it('still returns the order with its items, so the page can re-render', async () => {
    const fresh = await freshOrder()
    const { data } = await anon.rpc('cancel_order', { p_access_token: fresh.access_token })

    expect(data.order.order_number).toBe(fresh.order.order_number)
    expect(data.items.length).toBeGreaterThan(0)
    expect(data.order).not.toHaveProperty('access_token')
  })
})

describe('the token is the credential, not the order id', () => {
  let order

  beforeAll(async () => {
    order = await freshOrder()
  })

  it('refuses a made-up token', async () => {
    const { error } = await anon.rpc('cancel_order', { p_access_token: randomUUID() })

    expect(error?.message).toBe('order_not_found')
  })

  it('will not take the order id in place of the token', async () => {
    // The id is in the URL of nothing, but it does travel in payloads and logs.
    // Passing it here must find no order at all.
    const { error } = await anon.rpc('cancel_order', { p_access_token: order.order.id })

    expect(error?.message).toBe('order_not_found')
  })

  it('leaves the order untouched after those attempts', async () => {
    const { data } = await anon.rpc('get_order_by_token', {
      p_access_token: order.access_token,
    })

    expect(data.order.status).toBe(ORDER_STATUS.placed)
  })

  it('does not let one customer cancel another customer’s order', async () => {
    // B is signed in and holds no token for A's order. Being authenticated is
    // not what grants the right — holding the token is.
    const { client: b } = await signedInClient(process.env.TEST_USER_B_EMAIL)
    const { error } = await b.rpc('cancel_order', { p_access_token: randomUUID() })

    expect(error?.message).toBe('order_not_found')

    const { data } = await anon.rpc('get_order_by_token', {
      p_access_token: order.access_token,
    })
    expect(data.order.status).toBe(ORDER_STATUS.placed)
  })
})

describe('the window is enforced in the database, not the browser', () => {
  it('cannot be pushed past the window from here, because only staff can move an order', async () => {
    const order = await freshOrder()

    // The honest limit of this file: closing the window means advancing the
    // order, and advancing is staff-only. So what CAN be proved from the anon
    // key is that the customer has no way to reach that state themselves —
    // and that an order still waiting is still cancellable.
    //
    // The other half, that cancel_order() actually refuses once the kitchen has
    // started, needs privileges this client does not have. It is checked in
    // supabase/verify_order_status.sql, which runs as the owner.
    const { error: advanceError } = await anon.rpc('advance_order_status', {
      p_order_number: order.order.order_number,
    })

    expect(advanceError?.message).toMatch(/permission denied/i)

    const { error } = await anon.rpc('cancel_order', { p_access_token: order.access_token })
    expect(error).toBeNull()
  })

  it('is not decided by anything the client sends', async () => {
    // cancel_order() takes one argument. There is no status, no window, no
    // timestamp the caller could lie about — which is what makes the rule
    // unreachable from the browser rather than merely hidden.
    const order = await freshOrder()
    const { error } = await anon.rpc('cancel_order', {
      p_access_token: order.access_token,
      p_status: 'placed',
    })

    expect(error).not.toBeNull()
    expect(error.message).toMatch(/function|schema cache/i)
  })
})

describe('two cancellations of the same order race safely', () => {
  it('lets exactly one win', async () => {
    const order = await freshOrder()

    // Fired together, against a single row. cancel_order() locks it with FOR
    // UPDATE, so the second waits and then reads the status the first wrote —
    // rather than both seeing 'placed' and both writing.
    const results = await Promise.all([
      anon.rpc('cancel_order', { p_access_token: order.access_token }),
      anon.rpc('cancel_order', { p_access_token: order.access_token }),
    ])

    const succeeded = results.filter((r) => !r.error)
    const refused = results.filter((r) => r.error)

    expect(succeeded).toHaveLength(1)
    expect(refused).toHaveLength(1)
    expect(refused[0].error.message).toBe('already_cancelled')
  })

  it('leaves exactly one cancellation in the history', async () => {
    const order = await freshOrder()
    await Promise.all([
      anon.rpc('cancel_order', { p_access_token: order.access_token }),
      anon.rpc('cancel_order', { p_access_token: order.access_token }),
    ])

    const { data } = await anon.rpc('get_order_by_token', {
      p_access_token: order.access_token,
    })
    const cancellations = data.status_history.filter((h) => h.status === ORDER_STATUS.cancelled)

    expect(cancellations).toHaveLength(1)
  })
})

describe('the customer is told what happened', () => {
  it('has a message for every error cancel_order can raise', () => {
    // Anything without a mapping here would surface as a raw Postgres string.
    for (const code of ['cancel_window_closed', 'already_cancelled', 'order_not_found']) {
      expect(COPY.track.cancel.errors[code], `no message for "${code}"`).toBeTruthy()
    }
    expect(COPY.track.cancel.errors.unknown).toBeTruthy()
  })
})
