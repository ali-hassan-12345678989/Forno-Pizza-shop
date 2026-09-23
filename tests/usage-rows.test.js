import { describe, expect, it } from 'vitest'
import { movedCount, shareOfBusiest, usedIn, visibleRows } from '../src/lib/usageRows.js'
import { USAGE_PERIODS } from '../src/config/usage.js'

/**
 * Reading the usage table.
 *
 * Pure, so no Supabase here. Nothing in this module does arithmetic on the
 * figures — staff_ingredient_usage() nets cancellations off, excludes
 * deliveries and cuts the day in the shop's time zone. What is checked here is
 * that the screen never hides a row it should show, and never invents a number.
 */

const row = (name, usedToday, usedTotal, extra = {}) => ({
  id: name.toLowerCase(),
  name,
  unit: 'g',
  usedToday,
  usedTotal,
  stock: 1000,
  threshold: 200,
  isLow: false,
  isOut: false,
  ...extra,
})

const dough = row('Pizza Dough', 5000, 40000)
const cheese = row('Mozzarella', 1500, 22000)
const basil = row('Fresh Basil', 0, 300) // used before, but not today
const buns = row('Burger Bun', 0, 0) // never used at all

const rows = [dough, cheese, basil, buns]
const names = (list) => list.map((r) => r.name)

describe('which figure a row is read for', () => {
  it('gives today or all time', () => {
    expect(usedIn(dough, USAGE_PERIODS.today)).toBe(5000)
    expect(usedIn(dough, USAGE_PERIODS.total)).toBe(40000)
  })

  it('treats anything that is not "total" as today', () => {
    expect(usedIn(dough, undefined)).toBe(5000)
  })
})

describe('which rows are shown', () => {
  it('shows everything when nothing is filtering', () => {
    expect(names(visibleRows(rows))).toEqual([
      'Pizza Dough',
      'Mozzarella',
      'Fresh Basil',
      'Burger Bun',
    ])
  })

  it('keeps the order it was given, rather than re-ranking', () => {
    // The database orders by busiest first. Re-sorting here would be a second
    // opinion about what matters, and would disagree the moment the SQL changes.
    const shuffled = [buns, dough, basil, cheese]
    expect(names(visibleRows(shuffled))).toEqual([
      'Burger Bun',
      'Pizza Dough',
      'Fresh Basil',
      'Mozzarella',
    ])
  })

  it('narrows by name, whatever the case', () => {
    expect(names(visibleRows(rows, { query: 'mozz' }))).toEqual(['Mozzarella'])
    expect(names(visibleRows(rows, { query: 'PIZZA' }))).toEqual(['Pizza Dough'])
  })

  it('ignores a blank query', () => {
    expect(visibleRows(rows, { query: '   ' })).toHaveLength(4)
    expect(visibleRows(rows, { query: null })).toHaveLength(4)
  })

  it('"only what moved" drops rows with nothing used in THIS window', () => {
    // Basil moved historically but not today, so it belongs in one and not
    // the other. A single "has it ever moved" test would get this wrong.
    expect(names(visibleRows(rows, { period: USAGE_PERIODS.today, onlyUsed: true }))).toEqual([
      'Pizza Dough',
      'Mozzarella',
    ])
    expect(names(visibleRows(rows, { period: USAGE_PERIODS.total, onlyUsed: true }))).toEqual([
      'Pizza Dough',
      'Mozzarella',
      'Fresh Basil',
    ])
  })

  it('shows an untouched ingredient when not filtering', () => {
    // That it has not moved is itself the answer. Hiding it would make this
    // screen disagree with the stock table about how many ingredients exist.
    expect(names(visibleRows(rows, { onlyUsed: false }))).toContain('Burger Bun')
  })

  it('combines the search and the filter rather than letting one escape', () => {
    expect(
      visibleRows(rows, { query: 'basil', onlyUsed: true, period: USAGE_PERIODS.today }),
    ).toHaveLength(0)
  })

  it('survives being handed nothing', () => {
    expect(visibleRows(null)).toEqual([])
    expect(visibleRows(undefined, { onlyUsed: true })).toEqual([])
  })
})

describe('how many moved', () => {
  it('counts only rows with usage in that window', () => {
    expect(movedCount(rows, USAGE_PERIODS.today)).toBe(2)
    expect(movedCount(rows, USAGE_PERIODS.total)).toBe(3)
  })

  it('is zero on a day nothing happened', () => {
    expect(movedCount([buns], USAGE_PERIODS.today)).toBe(0)
    expect(movedCount(null, USAGE_PERIODS.today)).toBe(0)
  })
})

describe('the bar beside each figure', () => {
  it('fills for the busiest row and scales the rest against it', () => {
    const share = shareOfBusiest(rows, USAGE_PERIODS.today)
    expect(share(dough)).toBe(1)
    expect(share(cheese)).toBeCloseTo(1500 / 5000)
    expect(share(buns)).toBe(0)
  })

  it('is a share of the BUSIEST row, not of the column total', () => {
    // Shares of a sum are all slivers once there are thirty ingredients.
    const share = shareOfBusiest(rows, USAGE_PERIODS.today)
    const total = 5000 + 1500
    expect(share(dough)).toBe(1)
    expect(share(dough)).not.toBeCloseTo(5000 / total)
  })

  it('ranks within one window only', () => {
    const today = shareOfBusiest(rows, USAGE_PERIODS.today)
    const total = shareOfBusiest(rows, USAGE_PERIODS.total)
    expect(today(cheese)).toBeCloseTo(0.3)
    expect(total(cheese)).toBeCloseTo(22000 / 40000)
  })

  it('never divides by zero on a day nothing was used', () => {
    const share = shareOfBusiest([buns], USAGE_PERIODS.today)
    expect(share(buns)).toBe(0)
    expect(Number.isFinite(share(buns))).toBe(true)
  })

  it('survives being handed nothing', () => {
    expect(shareOfBusiest(null, USAGE_PERIODS.today)(dough)).toBe(0)
  })
})
