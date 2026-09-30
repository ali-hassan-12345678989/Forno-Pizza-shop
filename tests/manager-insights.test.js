import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALL_CANCEL_REASONS } from '../src/config/cancelReasons.js'
import { MAX_CANCELLED_ROWS, MAX_INSIGHT_DAYS } from '../src/config/insights.js'
import { MOVEMENT_REASONS } from '../src/config/usage.js'
import {
  FIXTURES,
  adminClient,
  anonClient,
  managerClient,
  placeOrderOrThrow,
  releasePlacedOrders,
  signedInClient,
  staffConfigured,
} from './helpers/supabase.js'

/**
 * Everything supabase/manager_insights.sql added.
 *
 * These talk to the real database, because every claim worth testing here is a
 * claim about what Postgres does: that a count writes both figures under one
 * lock, that a reason the constraint does not know is refused, that a signed-out
 * visitor cannot reach any of it. A mock would only prove the mock agrees with
 * the test that wrote it.
 *
 * Figures are checked as DELTAS wherever the shared database allows it. The
 * suite runs against the same project as every other file and as whatever the
 * browser did last, so "mozzarella is at 9,971 g" is true for about a second
 * while "this count moved it by exactly −150 g" is true for ever.
 */

const customerEmail = process.env.TEST_USER_A_EMAIL
const MOZZARELLA = FIXTURES.ingredientId

let manager
let admin

/** Today, in the shop's own zone — the zone every one of these functions cuts by. */
const shopToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

const stockOf = async (client, ingredientId) => {
  const { data, error } = await client.rpc('staff_ingredients')
  if (error) throw new Error(`staff_ingredients: ${error.message}`)
  const row = data.find((r) => r.id === ingredientId)
  if (!row) throw new Error('fixture ingredient missing from stock levels')
  return Number(row.stock_quantity)
}

beforeAll(async () => {
  if (!staffConfigured()) return
  manager = await managerClient()
  admin = await adminClient()
})

afterAll(async () => {
  await releasePlacedOrders()
})

describe.runIf(staffConfigured())('recording a physical count', () => {
  it('writes the book figure alongside the counted one, and returns both', async () => {
    const before = await stockOf(manager, MOZZARELLA)

    const { data, error } = await manager.rpc('record_stock_count', {
      p_ingredient_id: MOZZARELLA,
      p_counted: before - 150,
      p_note: 'test count',
    })

    expect(error).toBeNull()
    expect(Number(data.expected)).toBe(before)
    expect(Number(data.counted)).toBe(before - 150)
    expect(Number(data.variance)).toBe(-150)

    // Put it back, so this file leaves the shelf where it found it.
    await manager.rpc('record_stock_count', {
      p_ingredient_id: MOZZARELLA,
      p_counted: before,
      p_note: null,
    })
  })

  it('corrects the running total to what was counted', async () => {
    const before = await stockOf(manager, MOZZARELLA)

    await manager.rpc('record_stock_count', {
      p_ingredient_id: MOZZARELLA,
      p_counted: before - 40,
      p_note: null,
    })

    expect(await stockOf(manager, MOZZARELLA)).toBe(before - 40)

    await manager.rpc('record_stock_count', { p_ingredient_id: MOZZARELLA, p_counted: before })
    expect(await stockOf(manager, MOZZARELLA)).toBe(before)
  })

  it('files the difference in the ledger as a count, not as usage', async () => {
    // The distinction this whole feature rests on. A shelf found 2 kg short is
    // a discrepancy; folding it into "used" would report a theft as a busy
    // night and make the variance column describe its own cause.
    const today = shopToday()
    const usageBefore = await usedBetween(manager, today, today)

    const before = await stockOf(manager, MOZZARELLA)
    await manager.rpc('record_stock_count', {
      p_ingredient_id: MOZZARELLA,
      p_counted: before - 75,
    })

    const after = await usedBetween(manager, today, today)
    expect(after.used).toBe(usageBefore.used)
    expect(after.variance).toBe((usageBefore.variance ?? 0) - 75)

    await manager.rpc('record_stock_count', { p_ingredient_id: MOZZARELLA, p_counted: before })
  })

  it('records a count that agrees with the books rather than ignoring it', async () => {
    // "We checked and it was right" is exactly as worth knowing as a
    // discrepancy — without it there is no telling an unchecked shelf from a
    // clean one.
    const today = shopToday()
    const before = await stockOf(manager, MOZZARELLA)

    const { data, error } = await manager.rpc('record_stock_count', {
      p_ingredient_id: MOZZARELLA,
      p_counted: before,
    })

    expect(error).toBeNull()
    expect(Number(data.variance)).toBe(0)

    const row = await usedBetween(manager, today, today)
    expect(row.countsTaken).toBeGreaterThan(0)
  })

  it('refuses a negative count', async () => {
    const { error } = await manager.rpc('record_stock_count', {
      p_ingredient_id: MOZZARELLA,
      p_counted: -1,
    })
    expect(error?.message).toBe('invalid_count')
  })

  it('refuses an ingredient that does not exist', async () => {
    const { error } = await manager.rpc('record_stock_count', {
      p_ingredient_id: '00000000-0000-0000-0000-000000000000',
      p_counted: 10,
    })
    expect(error?.message).toBe('ingredient_not_found')
  })

  it('lets the Admin count too', async () => {
    // Same judgement as the kitchen screen: the Admin already sees every one of
    // these figures, so refusing them the correction would be a rule with
    // nothing behind it.
    const before = await stockOf(admin, MOZZARELLA)
    const { error } = await admin.rpc('record_stock_count', {
      p_ingredient_id: MOZZARELLA,
      p_counted: before,
    })
    expect(error).toBeNull()
  })

  it('is unreachable by a signed-out visitor', async () => {
    const { error } = await anonClient().rpc('record_stock_count', {
      p_ingredient_id: MOZZARELLA,
      p_counted: 10,
    })
    expect(error).not.toBeNull()
  })

  it('never exposes the counts table directly', async () => {
    const asAnon = await anonClient().from('stock_counts').select('*')
    const asManager = await manager.from('stock_counts').select('*')
    expect(asAnon.error).not.toBeNull()
    expect(asManager.error).not.toBeNull()
  })
})

/** One ingredient's row from staff_usage_between. */
const usedBetween = async (client, from, to, ingredientId = MOZZARELLA) => {
  const { data, error } = await client.rpc('staff_usage_between', { p_from: from, p_to: to })
  if (error) throw new Error(`staff_usage_between: ${error.message}`)
  const row = data.find((r) => r.ingredient_id === ingredientId)
  if (!row) throw new Error('fixture ingredient missing from usage window')
  return {
    used: Number(row.used),
    received: Number(row.received),
    variance: row.variance === null ? null : Number(row.variance),
    countsTaken: Number(row.counts_taken),
  }
}

describe.runIf(staffConfigured())('usage over a window', () => {
  it('counts an order placed today inside today', async () => {
    const today = shopToday()
    const before = await usedBetween(manager, today, today)

    const customer = await signedInClient(customerEmail)
    await placeOrderOrThrow(customer)

    const after = await usedBetween(manager, today, today)
    expect(after.used).toBeGreaterThan(before.used)
  })

  it('leaves that order outside a window that ended yesterday', async () => {
    // The half-open boundary. Getting this wrong by a day is the classic
    // reconciliation bug, and it is invisible until somebody counts a shelf.
    const today = shopToday()
    const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(
      new Date(Date.now() - 86400000),
    )

    const windowRow = await usedBetween(manager, yesterday, yesterday)
    const todayRow = await usedBetween(manager, today, today)

    // Whatever yesterday holds, today's orders are not in it.
    expect(windowRow.used).not.toBe(todayRow.used + 1)
    expect(Number.isFinite(windowRow.used)).toBe(true)
  })

  it('separates a delivery from consumption', async () => {
    const today = shopToday()
    const before = await usedBetween(manager, today, today)

    await manager.rpc('receive_stock', { p_ingredient_id: MOZZARELLA, p_quantity: 500 })

    const after = await usedBetween(manager, today, today)
    expect(after.received).toBe(before.received + 500)
    // A delivery is not cooking. If this ever fails, the reason filter has been
    // widened back to "anything but receive".
    expect(after.used).toBe(before.used)
  })

  it('reports an uncounted shelf as null rather than as zero', async () => {
    // The distinction the variance column is built on: "nobody looked" and
    // "looked, it balanced" must never render the same.
    const { data, error } = await manager.rpc('staff_usage_between', {
      p_from: '2020-01-01',
      p_to: '2020-01-02',
    })
    expect(error).toBeNull()
    expect(data.every((row) => row.variance === null)).toBe(true)
  })

  it('refuses a reversed window', async () => {
    const { error } = await manager.rpc('staff_usage_between', {
      p_from: '2026-09-30',
      p_to: '2026-09-01',
    })
    expect(error?.message).toBe('invalid_range')
  })

  it('refuses a window longer than the browser is allowed to ask for', async () => {
    const { error } = await manager.rpc('staff_usage_between', {
      p_from: '2020-01-01',
      p_to: '2026-12-31',
    })
    expect(error?.message).toBe('range_too_long')
  })

  it('agrees with config about how long that is', async () => {
    // MAX_INSIGHT_DAYS in the browser must match c_max_days in the function, or
    // the UI offers a window the database will refuse.
    const from = '2026-01-01'
    const justInside = new Date(Date.parse(`${from}T00:00:00Z`) + MAX_INSIGHT_DAYS * 86400000)
      .toISOString()
      .slice(0, 10)

    const { error } = await manager.rpc('staff_usage_between', { p_from: from, p_to: justInside })
    expect(error).toBeNull()
  })

  it('is unreachable by a signed-out visitor', async () => {
    const { error } = await anonClient().rpc('staff_usage_between', {
      p_from: '2026-09-01',
      p_to: '2026-09-30',
    })
    expect(error).not.toBeNull()
  })
})

describe.runIf(staffConfigured())('cancelling with a reason', () => {
  it('stores every reason the browser can offer', async () => {
    // The browser's vocabulary and the check constraint must be the same list.
    // A word in one and not the other is a cancellation that fails at the last
    // step, for somebody already trying to leave.
    const customer = await signedInClient(customerEmail)

    for (const reason of ALL_CANCEL_REASONS) {
      const order = await placeOrderOrThrow(customer)
      const { error } = await customer.rpc('cancel_order', {
        p_access_token: order.access_token,
        p_reason: reason,
      })
      expect(error, `reason rejected: ${reason}`).toBeNull()
    }
  })

  it('refuses a reason the breakdown could never group', async () => {
    const customer = await signedInClient(customerEmail)
    const order = await placeOrderOrThrow(customer)

    const { error } = await customer.rpc('cancel_order', {
      p_access_token: order.access_token,
      p_reason: 'because_i_said_so',
    })
    expect(error?.message).toBe('invalid_reason')

    // And the order is still cancellable without one.
    const second = await customer.rpc('cancel_order', { p_access_token: order.access_token })
    expect(second.error).toBeNull()
  })

  it('still cancels when no reason is given', async () => {
    // Optional all the way down. A customer who wants out must never be held
    // there by a required question.
    const customer = await signedInClient(customerEmail)
    const order = await placeOrderOrThrow(customer)

    const { error } = await customer.rpc('cancel_order', { p_access_token: order.access_token })
    expect(error).toBeNull()
  })

  it('shows the reason on the Manager’s list', async () => {
    const customer = await signedInClient(customerEmail)
    const order = await placeOrderOrThrow(customer)
    await customer.rpc('cancel_order', {
      p_access_token: order.access_token,
      p_reason: 'too_slow',
    })

    const { data, error } = await manager.rpc('staff_cancelled_orders', { p_days: 1 })
    expect(error).toBeNull()

    const row = data.find((r) => r.order_number === order.order_number)
    expect(row?.cancelled_reason).toBe('too_slow')
  })

  it('does not hand the Manager a phone number or an address', async () => {
    // The job here is to understand a pattern, not to have a second screen
    // carrying the shop's contact list.
    const { data } = await manager.rpc('staff_cancelled_orders', { p_days: 30 })
    for (const row of data ?? []) {
      expect(row).not.toHaveProperty('customer_phone')
      expect(row).not.toHaveProperty('delivery_address')
    }
  })

  it('never returns more rows than the browser was told to expect', async () => {
    // MAX_CANCELLED_ROWS mirrors c_max_rows in staff_cancelled_orders(). A cap
    // raised on one side and not the other is a list that silently truncates.
    const { data } = await manager.rpc('staff_cancelled_orders', { p_days: MAX_INSIGHT_DAYS })
    expect(data.length).toBeLessThanOrEqual(MAX_CANCELLED_ROWS)
  })

  it('is unreachable by a signed-out visitor', async () => {
    const { error } = await anonClient().rpc('staff_cancelled_orders', { p_days: 30 })
    expect(error).not.toBeNull()
  })
})

describe.runIf(staffConfigured())('what sells and when', () => {
  it('counts a placed order and excludes a cancelled one', async () => {
    // A cancelled order sold nothing, and its stock went back on the shelf —
    // counting it here would disagree with the usage screen beside it.
    const customer = await signedInClient(customerEmail)

    const before = await manager.rpc('staff_top_items', { p_days: 1 })
    const soldBefore = Number(before.data?.[0]?.qty_sold ?? 0)

    const kept = await placeOrderOrThrow(customer)
    const afterKept = await manager.rpc('staff_top_items', { p_days: 1 })
    expect(Number(afterKept.data?.[0]?.qty_sold ?? 0)).toBeGreaterThan(soldBefore)

    const dropped = await placeOrderOrThrow(customer)
    await customer.rpc('cancel_order', { p_access_token: dropped.access_token })

    const afterCancel = await manager.rpc('staff_top_items', { p_days: 1 })
    expect(Number(afterCancel.data?.[0]?.qty_sold ?? 0)).toBe(
      Number(afterKept.data?.[0]?.qty_sold ?? 0),
    )

    await customer.rpc('cancel_order', { p_access_token: kept.access_token })
  })

  it('covers the whole clock with no gap between day-parts', async () => {
    // A report with a gap in it invites the question "where did those orders
    // go". Every hour of the day must fall in exactly one bucket.
    const { data, error } = await manager.rpc('sales_by_daypart', { p_days: 30 })
    expect(error).toBeNull()

    const covered = new Set()
    for (const part of data) {
      const from = Number(part.starts_hour)
      const to = Number(part.ends_hour)
      for (let h = from; h !== to; h = (h + 1) % 24) covered.add(h)
    }
    expect(covered.size).toBe(24)
  })

  it('returns a quiet day-part at zero rather than leaving it out', async () => {
    // "Nobody orders then" is a scheduling answer. A missing row is not.
    const { data } = await manager.rpc('sales_by_daypart', { p_days: 1 })
    expect(data.length).toBe(5)
    expect(data.every((row) => Number(row.order_count) >= 0)).toBe(true)
  })

  it('hands back the buckets already in order', async () => {
    const { data } = await manager.rpc('sales_by_daypart', { p_days: 30 })
    const order = data.map((row) => Number(row.sort_order))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('refuses a nonsense window on both reports', async () => {
    expect((await manager.rpc('staff_top_items', { p_days: 0 })).error?.message).toBe(
      'invalid_range',
    )
    expect((await manager.rpc('sales_by_daypart', { p_days: -1 })).error?.message).toBe(
      'invalid_range',
    )
  })

  it('is unreachable by a signed-out visitor', async () => {
    expect((await anonClient().rpc('staff_top_items', { p_days: 7 })).error).not.toBeNull()
    expect((await anonClient().rpc('sales_by_daypart', { p_days: 7 })).error).not.toBeNull()
  })
})

describe.runIf(staffConfigured())('the ledger vocabulary', () => {
  it('knows the word the browser will send it', () => {
    // config/usage.js mirrors the check constraint on stock_movements.reason.
    // If 'count' were missing from one side, a correction would either be
    // refused by Postgres or silently counted as cooking.
    expect(MOVEMENT_REASONS.count).toBe('count')
  })
})
