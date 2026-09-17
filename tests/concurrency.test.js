import { describe, it, expect, beforeAll } from 'vitest'
import { anonClient, placeOrder, randomPhone } from './helpers/supabase.js'

// Part 3, task 5: two people ordering the last unit at the same instant must
// not both succeed.
//
// WHY THE OBVIOUS TEST DOES NOT WORK
//
// The first version of this file fired eight simultaneous orders at the last
// pizza and checked that one won. It passed — against a deduction deliberately
// broken to oversell. So did a burst of thirty. The reason is worth writing
// down, because it decides the shape of everything below.
//
// An UPDATE takes a row lock whether or not the SELECT before it asked for one.
// So two orders that share several ingredients collide on the FIRST one they
// have in common: the second blocks there, the first commits, and every read
// the second makes afterwards is fresh. The stale read lands harmlessly on an
// ingredient nobody was short of. For a six-ingredient pizza, overselling needs
// the scarce ingredient to be the first shared lock — a one-in-six accident.
//
// So the test picks two dishes that share EXACTLY ONE ingredient:
//
//     Loaded Fries     = Potato Fries + Cheese Sauce + Jalapeno
//     Peri Peri Fries  = Potato Fries + Peri Peri Seasoning
//
// Potato Fries is the only lock they contend on, and it is the one that runs
// out. There is nothing earlier to serialise them, so a missing FOR UPDATE
// shows up immediately: this file's main test sees 30 orders get through where
// 15 fit, and fails.
//
// THE MEASUREMENT
//
// The ingredients table is denied to every customer role, so the suite cannot
// read a stock level, set one, or check one afterwards. It does not need to.
// Order one at a time until the kitchen says no: nothing could have raced, so
// that count is the shop's true capacity. Put it all back, then do it again
// with orders flying at once. The two numbers must match — concurrency cannot
// conjure ingredients.

const anon = anonClient()

// Big enough that capacity is reached in a handful of orders rather than a
// hundred, small enough that capacity is a number with room to overshoot.
const QTY = 10

let loadedFries
let periPeriFries
let chickenTikka
let margherita

function order(sizeId, qty = QTY) {
  return placeOrder(
    anon,
    { fulfillmentType: 'pickup', address: null, name: 'Race Probe', phone: randomPhone() },
    [{ size_id: sizeId, quantity: qty, topping_ids: [] }],
  )
}

/**
 * The same, but recording when the request was in flight. A concurrency test
 * that quietly stopped being concurrent would keep passing and prove nothing.
 */
async function timedOrder(sizeId, qty = QTY) {
  const startedAt = Date.now()
  const result = await order(sizeId, qty)
  return { ...result, startedAt, finishedAt: Date.now() }
}

/** True only if every request was in flight before the first one came back. */
function allOverlapped(calls) {
  return Math.max(...calls.map((c) => c.startedAt)) < Math.min(...calls.map((c) => c.finishedAt))
}

/** Alternates the two dishes, so each neighbouring pair shares only one lock. */
const alternating = (n) =>
  Array.from({ length: n }, (_, i) => (i % 2 ? loadedFries : periPeriFries))

async function cancelAll(tokens) {
  await Promise.all(tokens.map((t) => anon.rpc('cancel_order', { p_access_token: t })))
}

async function sizeOf(itemName, sizeLabel) {
  const { data } = await anon
    .from('menu_items')
    .select('name, menu_item_sizes(id, size)')
    .eq('name', itemName)
    .single()

  const size = data.menu_item_sizes.find((s) => s.size === sizeLabel)
  if (!size) throw new Error(`${itemName} has no ${sizeLabel} size`)
  return size.id
}

beforeAll(async () => {
  loadedFries = await sizeOf('Loaded Fries', 'Regular')
  periPeriFries = await sizeOf('Peri Peri Fries', 'Regular')
  chickenTikka = await sizeOf('Chicken Tikka', 'Medium')
  margherita = await sizeOf('Margherita', 'Medium')
})

describe('orders that share ingredients do not deadlock', () => {
  it('runs a burst of different pizzas at once without one killing another', async () => {
    // Chicken Tikka and Margherita share dough, sauce and mozzarella, and their
    // recipe rows are in different orders. If the deduction walked each order's
    // own list instead of sorting by ingredient id, these would grab the same
    // rows in opposite orders and Postgres would kill one with a deadlock — a
    // failure that has nothing to do with stock and that a customer can make no
    // sense of.
    const results = await Promise.all([
      timedOrder(chickenTikka, 1),
      timedOrder(margherita, 1),
      timedOrder(chickenTikka, 1),
      timedOrder(margherita, 1),
      timedOrder(chickenTikka, 1),
      timedOrder(margherita, 1),
    ])

    expect(allOverlapped(results), 'the orders did not actually overlap').toBe(true)
    expect(results.filter((r) => /deadlock/i.test(r.error?.message ?? ''))).toHaveLength(0)
    expect(results.filter((r) => r.error)).toHaveLength(0)

    await cancelAll(results.map((r) => r.data.access_token))
  }, 60_000)

  it('survives a cancellation racing a new order for the same shelves', async () => {
    // A refund walks the same ingredient rows as a deduction, and both sort by
    // ingredient id. If either did not, this is where they would lock each
    // other out.
    const first = await order(chickenTikka, 1)
    expect(first.error).toBeNull()

    const [cancelled, placed] = await Promise.all([
      anon.rpc('cancel_order', { p_access_token: first.data.access_token }),
      order(chickenTikka, 1),
    ])

    for (const r of [cancelled, placed]) {
      expect(/deadlock/i.test(r.error?.message ?? '')).toBe(false)
      expect(r.error).toBeNull()
    }

    await cancelAll([placed.data.access_token])
  }, 60_000)
})

describe('concurrent orders cannot fit more food through than sequential ones', () => {
  /**
   * THE LOAD-BEARING TEST OF THIS TASK.
   *
   * Verified to fail against supabase/mutation_test_oversell.sql, which breaks
   * the deduction on purpose.
   */
  it('fits exactly the same number of orders either way', async () => {
    // ONE fixed plan, run twice. Same orders, same sequence, same length — the
    // only difference is whether they go one at a time or all at once.
    //
    // The "same length" part is not decoration. An earlier version drained
    // sequentially until the FIRST refusal and compared that count against a
    // burst. Those measure different things: the drain stops the moment Cheese
    // Sauce runs out, while the burst simply drops the Loaded Fries orders that
    // need it and lets the Peri Peri ones carry on consuming Potato Fries. It
    // reported 47 against 35 and called it overselling, on a database that was
    // behaving perfectly.
    const plan = alternating(80)

    // Two refusals are legitimate once the shelf is empty, and both mean the
    // same thing to this test:
    //
    //   out_of_stock      the deduction found too little, under the row lock
    //   item_unavailable  the ingredient already hit zero, so task 7's trigger
    //                     had marked the dish unavailable before pricing began
    //
    // Anything else — a deadlock, a serialization failure — would mean the
    // queueing is wrong even if the counts happen to line up, so the check
    // stays strict about what it will accept.
    const REFUSALS = ['out_of_stock', 'item_unavailable']

    // One at a time, and NOT stopping at the first refusal.
    const sequential = []
    for (const sizeId of plan) {
      const { data, error } = await order(sizeId)
      if (!error) sequential.push(data.access_token)
      else expect(REFUSALS, `refused with "${error.message}"`).toContain(error.message)
    }

    expect(sequential.length, 'nothing could be ordered at all').toBeGreaterThan(3)
    expect(sequential.length, 'the plan never ran out of stock — raise QTY').toBeLessThan(
      plan.length,
    )
    await cancelAll(sequential)

    // The identical plan, all at once.
    const burst = await Promise.all(plan.map((sizeId) => timedOrder(sizeId)))

    expect(allOverlapped(burst), 'the burst did not actually overlap').toBe(true)

    const won = burst.filter((r) => !r.error)
    for (const r of burst.filter((r) => r.error)) {
      expect(REFUSALS, `refused with "${r.error.message}"`).toContain(r.error.message)
    }

    await cancelAll(won.map((r) => r.data.access_token))

    // The assertion this entire task exists for. Anything above the sequential
    // count is food the shop sold without having.
    expect(
      won.length,
      `overselling: ${won.length} of the same ${plan.length} orders got through ` +
        `at once, where only ${sequential.length} did one at a time`,
    ).toBe(sequential.length)
  }, 300_000)

  it('is not simply that concurrent orders fail — with stock, a burst all wins', async () => {
    // The negative control. "Only fifteen got through" is meaningless unless a
    // burst CAN get through when there is plenty. A deduction that refused
    // everything under contention would satisfy the test above perfectly and be
    // completely wrong.
    const results = await Promise.all(Array.from({ length: 8 }, () => timedOrder(margherita, 1)))

    expect(allOverlapped(results), 'the control burst did not overlap').toBe(true)
    expect(
      results.filter((r) => r.error),
      'a plentiful burst was refused',
    ).toHaveLength(0)

    await cancelAll(results.map((r) => r.data.access_token))
  }, 60_000)
})
