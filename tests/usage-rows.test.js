import { describe, expect, it } from 'vitest'
import {
  countedCount,
  movedCount,
  shareOfBusiest,
  varianceCount,
  visibleRows,
} from '../src/lib/usageRows.js'

/**
 * Reading the usage table.
 *
 * Pure, so no Supabase here. Nothing in this module does arithmetic on the
 * figures — staff_usage_between() nets cancellations off, separates deliveries
 * from consumption and cuts both ends of the window in the shop's time zone.
 * What is checked here is that the screen never hides a row it should show, and
 * never invents a number.
 *
 * REWRITTEN FOR THE WINDOWED SHAPE. This file used to test a `usedToday` /
 * `usedTotal` pair and a `period` argument that chose between them. The owner's
 * review retired all-time usage — it can never be reconciled against a physical
 * count, because nobody has ever counted "all time" — so a row now carries one
 * `used` figure for the window that was asked for, plus what a count found.
 */

const row = (name, used, extra = {}) => ({
  id: name.toLowerCase(),
  name,
  unit: 'g',
  used,
  received: 0,
  stock: 1000,
  threshold: 200,
  isLow: false,
  isOut: false,
  variance: null,
  countsTaken: 0,
  lastCountedAt: null,
  ...extra,
})

const dough = row('Pizza Dough', 5000)
const cheese = row('Mozzarella', 1500, {
  // Counted, and the shelf was short.
  variance: -400,
  countsTaken: 1,
  lastCountedAt: '2026-09-30T09:00:00Z',
})
const basil = row('Fresh Basil', 0, {
  // Counted, and it balanced. NOT the same as never counted.
  variance: 0,
  countsTaken: 1,
  lastCountedAt: '2026-09-30T09:05:00Z',
})
const buns = row('Burger Bun', 0) // never used, never counted
/* Nothing sold it, and the shelf still came up short. The most suspicious
   reading this screen can produce, and the one the default filter used to
   hide — found by feature-testing the real page, not by any test. */
const oil = row('Olive Oil', 0, {
  variance: -350,
  countsTaken: 1,
  lastCountedAt: '2026-09-30T10:00:00Z',
})

const rows = [dough, cheese, basil, buns, oil]
const names = (list) => list.map((r) => r.name)

describe('which rows the table shows', () => {
  it('shows everything by default, including what never moved', () => {
    // An ingredient nothing touched is still an answer, and hiding it would
    // make this screen disagree with the stock table about how many
    // ingredients the shop has.
    expect(names(visibleRows(rows))).toEqual(names(rows))
  })

  it('filters to what actually moved', () => {
    expect(names(visibleRows(rows, { onlyUsed: true }))).toContain('Pizza Dough')
    expect(names(visibleRows(rows, { onlyUsed: true }))).toContain('Mozzarella')
    expect(names(visibleRows(rows, { onlyUsed: true }))).not.toContain('Burger Bun')
  })

  it('keeps a shelf that is off the books even when nothing sold it', () => {
    // Stock gone with no orders to account for it is the most suspicious thing
    // this screen can show, and the default filter used to hide exactly that
    // row while the summary line above it said one shelf did not match.
    expect(names(visibleRows(rows, { onlyUsed: true }))).toContain('Olive Oil')
  })

  it('does not extend that reprieve to a shelf that counted clean', () => {
    // Basil balanced. It has no usage and no discrepancy, so "only what moved"
    // should still hide it — otherwise the filter stops meaning anything.
    expect(names(visibleRows(rows, { onlyUsed: true }))).not.toContain('Fresh Basil')
  })

  it('filters to shelves that did not match the books', () => {
    expect(names(visibleRows(rows, { onlyVariance: true }))).toEqual(['Mozzarella', 'Olive Oil'])
  })

  it('does not treat a clean count as a discrepancy', () => {
    // Basil was counted and balanced. Putting it in a list of problems would
    // punish the one shelf somebody checked and found correct.
    expect(names(visibleRows(rows, { onlyVariance: true }))).not.toContain('Fresh Basil')
  })

  it('does not treat an uncounted shelf as a clean one either', () => {
    // Buns were never counted. It must not appear in a variance list, and it
    // must not be mistaken for a shelf that matched.
    expect(names(visibleRows(rows, { onlyVariance: true }))).not.toContain('Burger Bun')
    // Three shelves were counted (cheese, basil, oil); two of them disagreed.
    expect(countedCount(rows)).toBe(3)
    expect(varianceCount(rows)).toBe(2)
  })

  it('applies the search and the filter together, not one instead of the other', () => {
    expect(names(visibleRows(rows, { query: 'mozz' }))).toEqual(['Mozzarella'])
    // Mozzarella matches the search AND moved, so it survives both.
    expect(names(visibleRows(rows, { query: 'mozz', onlyUsed: true }))).toEqual(['Mozzarella'])
    // Basil matches the search but did not move, so the filter still excludes
    // it. Anything else would mean typing a name silently turned a filter off.
    expect(names(visibleRows(rows, { query: 'basil', onlyUsed: true }))).toEqual([])
  })

  it('ignores case and surrounding space in a search', () => {
    expect(names(visibleRows(rows, { query: '  DOUGH ' }))).toEqual(['Pizza Dough'])
  })

  it('survives being handed nothing', () => {
    expect(visibleRows(null)).toEqual([])
    expect(visibleRows(undefined, { onlyUsed: true })).toEqual([])
  })
})

describe('the counts in the summary line', () => {
  it('counts what moved', () => {
    expect(movedCount(rows)).toBe(2)
    expect(movedCount([buns])).toBe(0)
    expect(movedCount(null)).toBe(0)
  })

  it('counts shelves checked, not shelves that disagreed', () => {
    expect(countedCount(rows)).toBe(3)
    expect(varianceCount(rows)).toBe(2)
  })

  it('reports nothing counted as zero rather than failing', () => {
    expect(countedCount([buns])).toBe(0)
    expect(varianceCount(null)).toBe(0)
  })
})

describe('the bar beside each figure', () => {
  it('fills the width for the busiest row', () => {
    expect(shareOfBusiest(rows)(dough)).toBe(1)
  })

  it('scales the rest against that row, not against the total', () => {
    // Shares of a sum are all slivers once there are thirty ingredients.
    expect(shareOfBusiest(rows)(cheese)).toBeCloseTo(1500 / 5000)
  })

  it('gives an unused row no bar at all', () => {
    expect(shareOfBusiest(rows)(buns)).toBe(0)
  })

  it('does not divide by zero on a window where nothing moved', () => {
    expect(shareOfBusiest([buns])(buns)).toBe(0)
    expect(shareOfBusiest(null)(dough)).toBe(0)
  })
})
