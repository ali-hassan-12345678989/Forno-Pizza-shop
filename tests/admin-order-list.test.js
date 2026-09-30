import { describe, expect, it } from 'vitest'
import {
  ALL_ORDER_VIEWS,
  ORDER_VIEWS,
  bucketOf,
  countsByView,
  filterOrders,
  matchesQuery,
  matchesView,
} from '../src/lib/adminOrderList.js'
import { slaFor } from '../src/lib/sla.js'
import { ORDER_STATUS } from '../src/config/orderStatus.js'

/**
 * Filtering the Admin's order list.
 *
 * Pure, so no Supabase here. The case worth guarding is the one a naive
 * "not active means done" would get wrong: a cancelled order is not active
 * either, and filing a refund under "completed" would overstate the day.
 */

const order = (overrides = {}) => ({
  id: Math.random().toString(36).slice(2),
  orderNumber: '1001',
  customerName: 'Ayesha Khan',
  status: ORDER_STATUS.preparing,
  isActive: true,
  ...overrides,
})

const inProgress = order({ orderNumber: '1001', status: ORDER_STATUS.preparing, isActive: true })
const delivered = order({
  orderNumber: '1002',
  customerName: 'Bilal Ahmed',
  status: ORDER_STATUS.delivered,
  isActive: false,
})
const cancelled = order({
  orderNumber: '1003',
  customerName: 'Sana Tariq',
  status: ORDER_STATUS.cancelled,
  isActive: false,
})

const all = [inProgress, delivered, cancelled]
const numbers = (rows) => rows.map((row) => row.orderNumber)

describe('which bucket an order is in', () => {
  it('puts an order still running in progress', () => {
    expect(bucketOf(inProgress)).toBe(ORDER_VIEWS.active)
  })

  it('puts a finished order in completed', () => {
    expect(bucketOf(delivered)).toBe(ORDER_VIEWS.completed)
  })

  it('files a cancelled order on its own, not under completed', () => {
    // The case a "not active = done" shortcut gets wrong. A refund sitting in
    // the completed list would read as a sale.
    expect(cancelled.isActive).toBe(false)
    expect(bucketOf(cancelled)).toBe(ORDER_VIEWS.cancelled)
  })

  it('gives every order exactly one bucket', () => {
    for (const row of all) {
      const hits = ALL_ORDER_VIEWS.filter(
        (view) => view !== ORDER_VIEWS.all && matchesView(row, view),
      )
      expect(hits).toHaveLength(1)
    }
  })

  it('trusts isActive from the database rather than reading the status itself', () => {
    // If a new status is added to the ladder, order_is_active() knows about it
    // and this module must not pretend to. An unknown status that the database
    // calls active is active.
    expect(bucketOf(order({ status: 'some_future_stage', isActive: true }))).toBe(
      ORDER_VIEWS.active,
    )
  })
})

describe('the filters', () => {
  it('all keeps everything', () => {
    expect(numbers(filterOrders(all, { view: ORDER_VIEWS.all }))).toEqual(['1001', '1002', '1003'])
  })

  it('each other view keeps only its own', () => {
    expect(numbers(filterOrders(all, { view: ORDER_VIEWS.active }))).toEqual(['1001'])
    expect(numbers(filterOrders(all, { view: ORDER_VIEWS.completed }))).toEqual(['1002'])
    expect(numbers(filterOrders(all, { view: ORDER_VIEWS.cancelled }))).toEqual(['1003'])
  })

  it('keeps the list order rather than regrouping it', () => {
    const shuffled = [cancelled, inProgress, delivered]
    expect(numbers(filterOrders(shuffled, { view: ORDER_VIEWS.all }))).toEqual([
      '1003',
      '1001',
      '1002',
    ])
  })

  it('survives being handed nothing', () => {
    expect(filterOrders(null)).toEqual([])
    expect(filterOrders(undefined, { view: ORDER_VIEWS.active })).toEqual([])
  })
})

describe('the search', () => {
  it('matches an order number', () => {
    expect(numbers(filterOrders(all, { query: '1002' }))).toEqual(['1002'])
  })

  it('matches a customer name, whatever the case', () => {
    expect(numbers(filterOrders(all, { query: 'bilal' }))).toEqual(['1002'])
    expect(numbers(filterOrders(all, { query: 'AYESHA' }))).toEqual(['1001'])
  })

  it('matches part of a name', () => {
    expect(numbers(filterOrders(all, { query: 'tar' }))).toEqual(['1003'])
  })

  it('an empty or blank query keeps everything', () => {
    expect(matchesQuery(inProgress, '')).toBe(true)
    expect(matchesQuery(inProgress, '   ')).toBe(true)
    expect(matchesQuery(inProgress, null)).toBe(true)
  })

  it('does not search the status, which would make "delivered" match a stage', () => {
    expect(filterOrders(all, { query: 'delivered' })).toEqual([])
  })

  it('narrows within the chosen filter rather than escaping it', () => {
    // Bilal's order is completed, so searching him under "in progress" finds
    // nothing — the chip is a filter, not a suggestion.
    expect(filterOrders(all, { view: ORDER_VIEWS.active, query: 'bilal' })).toEqual([])
  })
})

describe('the delayed view', () => {
  /* The deadline is the shop's own promise, so these fixtures carry one.
     25 minutes for delivery, 15 for pickup — the same words that are on the
     live menu today. */
  const settings = { deliveryEta: '25–35 min', pickupEta: '15 min' }
  const now = Date.parse('2026-09-30T12:00:00Z')
  const minutesAgo = (n) => new Date(now - n * 60000).toISOString()

  const late = order({
    orderNumber: '2001',
    status: ORDER_STATUS.preparing,
    isActive: true,
    fulfillmentType: 'delivery',
    placedAt: minutesAgo(50), // promise was 35
  })
  const fine = order({
    orderNumber: '2002',
    status: ORDER_STATUS.preparing,
    isActive: true,
    fulfillmentType: 'delivery',
    placedAt: minutesAgo(5),
  })
  const lateButFinished = order({
    orderNumber: '2003',
    status: ORDER_STATUS.delivered,
    isActive: false,
    fulfillmentType: 'delivery',
    placedAt: minutesAgo(200),
  })

  const sla = { settings, now }
  const rows = [late, fine, lateButFinished]

  it('picks out an order past the promise the customer was given', () => {
    const shown = filterOrders(rows, { view: ORDER_VIEWS.delayed, sla })
    expect(shown.map((o) => o.orderNumber)).toEqual(['2001'])
  })

  it('does not call a finished order late, however long it took', () => {
    // This board exists to dispatch somebody, not to keep score. An order that
    // has arrived is nobody's deadline any more.
    const shown = filterOrders(rows, { view: ORDER_VIEWS.delayed, sla })
    expect(shown.map((o) => o.orderNumber)).not.toContain('2003')
  })

  it('counts a late order as active as well, because it is both', () => {
    const counts = countsByView(rows, sla)
    expect(counts.delayed).toBe(1)
    expect(counts.active).toBe(2)
  })

  it('still judges without a promise, using the documented fallback', () => {
    /* Settings have not loaded yet on a first render, and an order that has
       been out for an hour is late whether or not the browser has fetched the
       shop's ETA text. So it falls back rather than going quiet — and flags the
       deadline as assumed, which is what lets the screen say so.
       Asserted with an explicit `now`: without one this reads the real clock,
       and the fixture timestamps would decide the result by accident. */
    expect(filterOrders(rows, { view: ORDER_VIEWS.delayed, sla: { now } })).toHaveLength(1)
    expect(slaFor(late, { now }).assumed).toBe(true)
    expect(slaFor(late, { settings, now }).assumed).toBe(false)
  })

  it("reads the deadline off the shop's own promise, upper bound first", () => {
    // "25–35 min" promises thirty-five. Judging against twenty-five would flag
    // orders that arrived inside the window the customer was actually given.
    expect(slaFor(fine, { settings, now }).limitMinutes).toBe(35)
    expect(slaFor(late, { settings, now }).overdueMinutes).toBeCloseTo(15)
  })
})

describe('the chip counts', () => {
  it('counts each bucket and the whole list', () => {
    expect(countsByView(all)).toEqual({
      all: 3,
      active: 1,
      // Nothing carries a placedAt in this fixture, so nothing can be judged
      // late — which is the right answer, not a missing one.
      delayed: 0,
      completed: 1,
      cancelled: 1,
    })
  })

  it('has a key for every view, so a chip can never read undefined', () => {
    const counts = countsByView([])
    for (const view of ALL_ORDER_VIEWS) expect(counts[view]).toBe(0)
  })

  it('counts the whole list, not what a search is showing', () => {
    // The chips say how much is behind them; narrowing the search must not
    // make the other chips look empty.
    expect(countsByView(all).completed).toBe(1)
    expect(filterOrders(all, { query: 'ayesha' })).toHaveLength(1)
  })

  it('survives being handed nothing', () => {
    expect(countsByView(null).all).toBe(0)
  })
})
