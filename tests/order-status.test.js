import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  ORDER_STATUS,
  STATUS_FLOW,
  stagesFor,
  stageIndexOf,
  stageStateOf,
  isFinal,
  isCancelled,
} from '../src/config/orderStatus.js'
import { COPY } from '../src/content/copy.js'
import { anonClient, placeOrderOrThrow } from './helpers/supabase.js'

// Part 3, task 1: the four stages, the history behind them, and the fact that
// only the kitchen can move an order between them.
//
// The ladder is written down twice — STATUS_FLOW in JavaScript for the tracking
// UI, order_status_flow() in SQL for the function that enforces it — because a
// browser cannot enforce a sequence and Postgres cannot import a module. The
// first describe block is the thing that keeps those two copies honest.

const anon = anonClient()

describe('the status ladder is the same on both sides', () => {
  it.each(Object.keys(STATUS_FLOW))('%s runs through exactly four stages', (type) => {
    const stages = STATUS_FLOW[type]

    expect(stages).toHaveLength(4)
    expect(stages[0]).toBe(ORDER_STATUS.placed)
    expect(stages[1]).toBe(ORDER_STATUS.preparing)
    expect(new Set(stages).size).toBe(4)
  })

  it('never puts a stage on a ladder it does not belong to', () => {
    for (const stage of Object.values(STATUS_FLOW).flat()) {
      expect(Object.values(ORDER_STATUS)).toContain(stage)
    }
  })

  it('every status the UI can render is one the database allows', async () => {
    // The check constraint is the authority. Reading it back proves the JS
    // constants are not a private vocabulary that happens to look right.
    const { data, error } = await anon.rpc('order_status_values')

    if (error?.message?.includes('Could not find the function')) {
      throw new Error(
        'Run supabase/order_status.sql in the Supabase SQL editor — it defines ' +
          'the helper this test reads the check constraint through.',
      )
    }

    expect(error).toBeNull()
    expect([...data].sort()).toEqual(Object.values(ORDER_STATUS).sort())

    // And every stage the tracker will actually render is in that same list.
    for (const stage of Object.values(STATUS_FLOW).flat()) {
      expect(data).toContain(stage)
    }
  })

  it('the delivery and pickup ladders differ only after preparing', () => {
    const delivery = stagesFor('delivery')
    const pickup = stagesFor('pickup')

    expect(delivery.slice(0, 2)).toEqual(pickup.slice(0, 2))
    expect(delivery[2]).toBe(ORDER_STATUS.outForDelivery)
    expect(pickup[2]).toBe(ORDER_STATUS.readyForPickup)
  })

  it('a pickup stage is not on the delivery ladder', () => {
    expect(stageIndexOf(ORDER_STATUS.readyForPickup, 'delivery')).toBe(-1)
    expect(stageIndexOf(ORDER_STATUS.outForDelivery, 'pickup')).toBe(-1)
  })

  it('knows which statuses end an order', () => {
    expect(isFinal(ORDER_STATUS.delivered)).toBe(true)
    expect(isFinal(ORDER_STATUS.pickedUp)).toBe(true)
    expect(isFinal(ORDER_STATUS.cancelled)).toBe(true)
    expect(isFinal(ORDER_STATUS.placed)).toBe(false)
    expect(isFinal(ORDER_STATUS.preparing)).toBe(false)
    expect(isFinal(ORDER_STATUS.outForDelivery)).toBe(false)
  })

  it('has a customer-facing label for every status', () => {
    for (const status of Object.values(ORDER_STATUS)) {
      expect(COPY.track.statuses[status], `no label for "${status}"`).toBeTruthy()
    }
  })

  it('has a note for every stage a customer can be sitting on', () => {
    const everyStage = new Set(Object.values(STATUS_FLOW).flat())

    for (const stage of everyStage) {
      expect(COPY.track.trail.notes[stage], `no note for "${stage}"`).toBeTruthy()
    }
  })
})

describe('status history', () => {
  let order

  beforeAll(async () => {
    order = await placeOrderOrThrow(anon, { name: 'Status Probe' })
  })

  it('records the opening stage the moment the order exists', () => {
    expect(order.status_history).toHaveLength(1)
    expect(order.status_history[0].status).toBe(ORDER_STATUS.placed)
  })

  it('agrees with the order it belongs to', () => {
    expect(order.order.status).toBe(ORDER_STATUS.placed)
  })

  it('comes back to a guest holding the token', async () => {
    const { data } = await anon.rpc('get_order_by_token', {
      p_access_token: order.access_token,
    })

    expect(data.status_history).toHaveLength(1)
    expect(data.status_history[0].status).toBe(ORDER_STATUS.placed)
    expect(data.status_history[0].created_at).toBeTruthy()
  })

  it('is not readable straight from the table by a guest', async () => {
    // A guest has no SELECT policy on order_status_history. The token function
    // is the only way in — this is what makes the token, not the order id, the
    // credential.
    const { data } = await anon
      .from('order_status_history')
      .select('*')
      .eq('order_id', order.order.id)

    expect(data ?? []).toEqual([])
  })
})

describe('only the kitchen can move an order', () => {
  let order

  beforeAll(async () => {
    order = await placeOrderOrThrow(anon, { name: 'Status Probe' })
  })

  it('refuses set_order_status to an anonymous caller', async () => {
    const { error } = await anon.rpc('set_order_status', {
      p_order_id: order.order.id,
      p_status: ORDER_STATUS.delivered,
    })

    // Specifically a privilege refusal. "Could not find the function" would
    // also be an error and would prove nothing — a function that does not
    // exist yet is not the same as one that exists and says no.
    expect(error?.message).toMatch(/permission denied/i)
  })

  it('refuses advance_order_status to an anonymous caller', async () => {
    const { error } = await anon.rpc('advance_order_status', {
      p_order_number: order.order.order_number,
    })

    expect(error?.message).toMatch(/permission denied/i)
  })

  it('refuses a direct UPDATE of the status column', async () => {
    const { error } = await anon
      .from('orders')
      .update({ status: ORDER_STATUS.delivered })
      .eq('id', order.order.id)

    // Refused at the privilege layer, before any policy is consulted — which is
    // why this reads "permission denied" rather than a row-count of zero. An
    // update that simply matched nothing would look identical to a caller and
    // would not prove the column is protected.
    expect(error?.message).toMatch(/permission denied/i)
  })

  it('leaves the order where it was after all of that', async () => {
    const { data } = await anon.rpc('get_order_by_token', {
      p_access_token: order.access_token,
    })

    expect(data.order.status).toBe(ORDER_STATUS.placed)
    expect(data.status_history).toHaveLength(1)
  })

  it('cannot be reached by a made-up order id either', async () => {
    const { error } = await anon.rpc('set_order_status', {
      p_order_id: randomUUID(),
      p_status: ORDER_STATUS.preparing,
    })

    expect(error?.message).toMatch(/permission denied/i)
  })
})

describe('cancellation is off the ladder', () => {
  it('is not one of the four stages', () => {
    for (const stages of Object.values(STATUS_FLOW)) {
      expect(stages).not.toContain(ORDER_STATUS.cancelled)
    }
  })

  it('is recognised as cancelled and as final', () => {
    expect(isCancelled(ORDER_STATUS.cancelled)).toBe(true)
    expect(isCancelled(ORDER_STATUS.placed)).toBe(false)
    expect(isFinal(ORDER_STATUS.cancelled)).toBe(true)
  })
})

describe('how each stage of the trail reads', () => {
  const delivery = stagesFor('delivery')

  /** The four stages as the trail would draw them, for a given order. */
  function trail(status, history = []) {
    const reached = stageIndexOf(status, 'delivery')
    return delivery.map((stage, index) =>
      stageStateOf({ index, reached, status, reachedInHistory: history.includes(stage) }),
    )
  }

  it('marks the stage in progress on a live order', () => {
    expect(trail(ORDER_STATUS.placed)).toEqual(['current', 'pending', 'pending', 'pending'])
    expect(trail(ORDER_STATUS.preparing)).toEqual(['done', 'current', 'pending', 'pending'])
    expect(trail(ORDER_STATUS.outForDelivery)).toEqual(['done', 'done', 'current', 'pending'])
  })

  it('shows a finished order as finished, not as still happening', () => {
    // The bug this pins: "Delivered" was rendering as the step in progress,
    // pulsing ring and all, on an order that had already arrived.
    expect(trail(ORDER_STATUS.delivered)).toEqual(['done', 'done', 'done', 'done'])
    expect(trail(ORDER_STATUS.delivered)).not.toContain('current')
  })

  it('does the same at the end of the pickup ladder', () => {
    const pickup = stagesFor('pickup')
    const status = ORDER_STATUS.pickedUp
    const reached = stageIndexOf(status, 'pickup')
    const states = pickup.map((stage, index) =>
      stageStateOf({ index, reached, status, reachedInHistory: true }),
    )

    expect(states).toEqual(['done', 'done', 'done', 'done'])
  })

  it('stops a cancelled order where it stopped', () => {
    // Cancelled from 'placed': the first stage happened, nothing else did, and
    // nothing ahead is "coming" any more.
    expect(trail(ORDER_STATUS.cancelled, [ORDER_STATUS.placed])).toEqual([
      'done',
      'pending',
      'pending',
      'pending',
    ])
    expect(trail(ORDER_STATUS.cancelled, [ORDER_STATUS.placed])).not.toContain('current')
  })

  it('leaves a skipped stage passed but untimed', () => {
    // A kitchen that jumps straight to "out for delivery" never recorded
    // "preparing". The stage is behind the order, so it reads as done — the
    // absence of a timestamp is what tells the truth about it.
    const reached = stageIndexOf(ORDER_STATUS.outForDelivery, 'delivery')

    expect(
      stageStateOf({
        index: 1,
        reached,
        status: ORDER_STATUS.outForDelivery,
        reachedInHistory: false,
      }),
    ).toBe('done')
  })
})
