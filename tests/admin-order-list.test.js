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

describe('the chip counts', () => {
  it('counts each bucket and the whole list', () => {
    expect(countsByView(all)).toEqual({
      all: 3,
      active: 1,
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
