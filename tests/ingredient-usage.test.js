import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
 * The stock ledger and what it reports (staff_ingredient_usage).
 *
 * These place real orders, because the ledger is written inside the same
 * transaction as the deduction it records — an inserted fixture row would
 * prove nothing about whether that actually happens.
 *
 * Figures are checked as DELTAS, never absolutes. The suite shares a database
 * with every other test file and with whatever the browser did last, so
 * "mozzarella is at 9,971g" is true for about a second. "Placing this order
 * moved it by exactly 150g" is true for ever.
 */

const customerEmail = process.env.TEST_USER_A_EMAIL
const MOZZARELLA = FIXTURES.ingredientId

let manager
let admin

const usageFor = async (client, ingredientId) => {
  const { data, error } = await client.rpc('staff_ingredient_usage')
  if (error) throw new Error(`staff_ingredient_usage: ${error.message}`)
  const row = data.find((r) => r.ingredient_id === ingredientId)
  if (!row) throw new Error('fixture ingredient missing from usage')
  return {
    today: Number(row.used_today),
    total: Number(row.used_total),
    stock: Number(row.stock_quantity),
    all: data,
  }
}

beforeAll(async () => {
  if (!staffConfigured()) return
  manager = (await managerClient()).client
  admin = (await adminClient()).client
}, 30_000)

afterAll(async () => {
  await releasePlacedOrders()
})

describe('who may read usage', () => {
  it('refuses an anonymous caller', async () => {
    const { error } = await anonClient().rpc('staff_ingredient_usage')
    expect(error).toBeTruthy()
  })

  it('refuses a signed-in customer', async () => {
    const { client } = await signedInClient(customerEmail)
    const { error } = await client.rpc('staff_ingredient_usage')
    expect(error?.message).toBe('not_staff')
  })

  it('allows the Manager', async () => {
    if (!staffConfigured()) return
    const { error } = await manager.rpc('staff_ingredient_usage')
    expect(error).toBeNull()
  })

  it('allows the Admin', async () => {
    if (!staffConfigured()) return
    const { error } = await admin.rpc('staff_ingredient_usage')
    expect(error).toBeNull()
  })

  it('shows both roles the same figures', async () => {
    if (!staffConfigured()) return
    const m = await usageFor(manager, MOZZARELLA)
    const a = await usageFor(admin, MOZZARELLA)
    expect(a.total).toBe(m.total)
  })
})

describe('the ledger table itself is unreachable', () => {
  it('no client role can read it', async () => {
    const { client } = await signedInClient(customerEmail)
    const { error } = await client.from('stock_movements').select('*').limit(1)
    expect(error).toBeTruthy()
  })

  it('no client role can write one', async () => {
    const { client } = await signedInClient(customerEmail)
    const { error } = await client
      .from('stock_movements')
      .insert({ ingredient_id: MOZZARELLA, quantity_delta: -1, reason: MOVEMENT_REASONS.order })
    expect(error).toBeTruthy()
  })

  it('not even the Admin, who can read the report', async () => {
    if (!staffConfigured()) return
    const { error } = await admin.from('stock_movements').select('*').limit(1)
    expect(error).toBeTruthy()
  })

  it('record_movement() is not callable from a browser', async () => {
    if (!staffConfigured()) return
    const { error } = await admin.rpc('record_movement', {
      p_ingredient_id: MOZZARELLA,
      p_delta: -999,
      p_reason: MOVEMENT_REASONS.order,
      p_order_id: null,
    })
    expect(error).toBeTruthy()
  })
})

describe('what the report contains', () => {
  it('lists every ingredient, including ones nothing has touched', async () => {
    if (!staffConfigured()) return
    const { data: stock } = await manager.rpc('staff_ingredients')
    const { all } = await usageFor(manager, MOZZARELLA)

    // A LEFT JOIN, not an inner one. An inner join would silently drop every
    // ingredient the shop has not used yet — exactly the list being checked.
    expect(all).toHaveLength(stock.length)
  })

  it('never reports a negative figure for an untouched ingredient', async () => {
    if (!staffConfigured()) return
    const { all } = await usageFor(manager, MOZZARELLA)
    for (const row of all) {
      expect(Number(row.used_today)).not.toBeNaN()
      expect(Number(row.used_total)).toBeGreaterThanOrEqual(0)
    }
  })

  it('carries the same stock figure the stock screen shows', async () => {
    if (!staffConfigured()) return
    const { data: stock } = await manager.rpc('staff_ingredients')
    const { all } = await usageFor(manager, MOZZARELLA)

    for (const row of all) {
      const same = stock.find((s) => s.id === row.ingredient_id)
      expect(Number(row.stock_quantity)).toBe(Number(same.stock_quantity))
      expect(row.is_low).toBe(same.is_low)
      expect(row.is_out).toBe(same.is_out)
    }
  })
})

describe('an order records what it used', () => {
  it('raises usage by exactly what left the shelf', async () => {
    if (!staffConfigured()) return

    const before = await usageFor(manager, MOZZARELLA)
    await placeOrderOrThrow(anonClient(), { name: 'Usage Probe' })
    const after = await usageFor(manager, MOZZARELLA)

    const consumed = before.stock - after.stock
    expect(consumed).toBeGreaterThan(0)

    // The ledger and the running total have to agree, or one of them is lying.
    expect(after.today - before.today).toBeCloseTo(consumed, 3)
    expect(after.total - before.total).toBeCloseTo(consumed, 3)
  })

  it('counts two orders as twice the usage', async () => {
    if (!staffConfigured()) return

    const before = await usageFor(manager, MOZZARELLA)
    await placeOrderOrThrow(anonClient(), { name: 'Usage Probe' })
    const one = await usageFor(manager, MOZZARELLA)
    await placeOrderOrThrow(anonClient(), { name: 'Usage Probe' })
    const two = await usageFor(manager, MOZZARELLA)

    const first = one.today - before.today
    const second = two.today - one.today
    expect(second).toBeCloseTo(first, 3)
  })
})

describe('a cancelled order used nothing', () => {
  it('nets back to where it started', async () => {
    if (!staffConfigured()) return

    const before = await usageFor(manager, MOZZARELLA)

    const anon = anonClient()
    const order = await placeOrderOrThrow(anon, { name: 'Cancel Usage Probe' })
    const during = await usageFor(manager, MOZZARELLA)
    expect(during.today).toBeGreaterThan(before.today)

    const { error } = await anon.rpc('cancel_order', { p_access_token: order.access_token })
    expect(error).toBeNull()

    const after = await usageFor(manager, MOZZARELLA)

    // An order can only be cancelled before the kitchen starts, so nothing was
    // made and nothing was used. The two ledger rows sum to zero.
    expect(after.today).toBeCloseTo(before.today, 3)
    expect(after.total).toBeCloseTo(before.total, 3)
    expect(after.stock).toBeCloseTo(before.stock, 3)
  })
})

describe('a delivery is not usage', () => {
  it('raises stock without raising a single usage figure', async () => {
    if (!staffConfigured()) return

    const before = await usageFor(manager, MOZZARELLA)

    const { error } = await manager.rpc('receive_stock', {
      p_ingredient_id: MOZZARELLA,
      p_quantity: 500,
    })
    expect(error).toBeNull()

    const after = await usageFor(manager, MOZZARELLA)

    expect(after.stock - before.stock).toBeCloseTo(500, 3)
    // Receiving 500g of mozzarella is not using 500g of mozzarella, and it must
    // not read as using -500g either.
    expect(after.today).toBeCloseTo(before.today, 3)
    expect(after.total).toBeCloseTo(before.total, 3)
  })
})

describe('today against all time', () => {
  it('never reports more used today than in total', async () => {
    if (!staffConfigured()) return
    const { all } = await usageFor(manager, MOZZARELLA)

    for (const row of all) {
      expect(Number(row.used_today)).toBeLessThanOrEqual(Number(row.used_total) + 1e-6)
    }
  })

  it('counts an order placed now in both figures', async () => {
    if (!staffConfigured()) return

    const before = await usageFor(manager, MOZZARELLA)
    await placeOrderOrThrow(anonClient(), { name: 'Usage Probe' })
    const after = await usageFor(manager, MOZZARELLA)

    expect(after.today - before.today).toBeCloseTo(after.total - before.total, 3)
  })
})
