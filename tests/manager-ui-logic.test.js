import { describe, expect, it } from 'vitest'
import {
  MAX_RANGE_DAYS,
  RANGE_IDS,
  WEEK_STARTS_ON,
  daysBetween,
  isValidRange,
  rangeFor,
  startOfWeek,
} from '../src/lib/dateRanges'
import { LEVEL_BAND, dailySeries, describePacing, pacingAgainstWeekday } from '../src/lib/pacing'
import { shiftDay, shopDayKey, weekdayOf } from '../src/lib/shopDays'
import { FULL_AT_MULTIPLE, coverRatio, stockBar } from '../src/lib/stockLevel'
import { formatMultiple, formatQuantity, formatSignedQuantity } from '../src/lib/format'
import { readyLines, upsertQuantity } from '../src/lib/deliverySheet'
import { groupByReason } from '../src/lib/cancellations'

/**
 * The rules behind the Manager UI the owner asked for, tested without a browser
 * or a database.
 *
 * Everything under test here is pure by design. The screens that use it are
 * covered separately in tests/ui/, and the database functions it talks to are
 * covered in tests/manager-insights.test.js — this file is only the arithmetic,
 * which is the part most worth pinning down because it is the part nobody can
 * see going wrong.
 */

/* Fixed dates rather than "now". A test that builds its own expectations from
   the clock passes on every day including the ones where the code is broken. */
const WEDNESDAY = '2026-09-30'

describe('shop days', () => {
  it('reads a calendar date as a calendar date, not as UTC midnight', () => {
    // The bug this prevents: new Date('2026-09-30').getDay() is Tuesday for
    // anyone west of Greenwich, which would put every figure on the wrong day.
    expect(weekdayOf(WEDNESDAY)).toBe(3)
    expect(weekdayOf('2026-10-04')).toBe(0)
  })

  it('shifts across a month boundary', () => {
    expect(shiftDay('2026-10-01', -1)).toBe('2026-09-30')
    expect(shiftDay('2026-09-30', 1)).toBe('2026-10-01')
  })

  it('shifts across a year boundary', () => {
    expect(shiftDay('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('reports the shop day, not the reader day', () => {
    // 19:30 UTC is already the next day in Karachi (UTC+5).
    const evening = new Date('2026-09-30T19:30:00Z')
    expect(shopDayKey(evening, 'Asia/Karachi')).toBe('2026-10-01')
    expect(shopDayKey(evening, 'UTC')).toBe('2026-09-30')
  })

  it('refuses a malformed key rather than inventing a day', () => {
    expect(weekdayOf('not-a-date')).toBeNull()
    expect(shiftDay('', 1)).toBeNull()
  })
})

describe('date ranges', () => {
  it('starts the week on Monday', () => {
    expect(WEEK_STARTS_ON).toBe(1)
    expect(startOfWeek(WEDNESDAY)).toBe('2026-09-28')
  })

  it('puts Sunday at the END of its week, not the start', () => {
    // The classic off-by-one: with a Monday-based week, Sunday is six days in.
    // Getting this wrong would split a weekend across two reports, which is the
    // one thing a pizza shop's week must not do.
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28')
  })

  it('week-to-date runs from Monday to today, inclusive', () => {
    expect(rangeFor(RANGE_IDS.weekToDate, WEDNESDAY)).toEqual({
      from: '2026-09-28',
      to: WEDNESDAY,
    })
  })

  it('prior week is a whole Monday-to-Sunday, not a rolling seven days', () => {
    // This is the distinction that makes it reconcilable: a complete week is a
    // period somebody can have counted stock at both ends of.
    expect(rangeFor(RANGE_IDS.priorWeek, WEDNESDAY)).toEqual({
      from: '2026-09-21',
      to: '2026-09-27',
    })
  })

  it('last 7 days is seven days, counting today', () => {
    const { from, to } = rangeFor(RANGE_IDS.last7, WEDNESDAY)
    expect(daysBetween(from, to)).toBe(6)
    expect(to).toBe(WEDNESDAY)
  })

  it('last 30 days is thirty days, counting today', () => {
    const { from, to } = rangeFor(RANGE_IDS.last30, WEDNESDAY)
    expect(daysBetween(from, to)).toBe(29)
  })

  it('today is a single day at both ends', () => {
    expect(rangeFor(RANGE_IDS.today, WEDNESDAY)).toEqual({ from: WEDNESDAY, to: WEDNESDAY })
  })

  it('has no preset for all time, which is the point', () => {
    expect(rangeFor('allTime', WEDNESDAY)).toBeNull()
  })

  it('accepts a single day and rejects a reversed pair', () => {
    expect(isValidRange(WEDNESDAY, WEDNESDAY)).toBe(true)
    expect(isValidRange('2026-09-30', '2026-09-01')).toBe(false)
  })

  it('rejects a window longer than the database will take', () => {
    expect(isValidRange('2025-01-01', '2026-09-30')).toBe(false)
    expect(daysBetween('2025-01-01', '2026-09-30')).toBeGreaterThan(MAX_RANGE_DAYS)
  })

  it('rejects a missing end', () => {
    expect(isValidRange(WEDNESDAY, '')).toBe(false)
    expect(isValidRange('', WEDNESDAY)).toBe(false)
  })
})

describe('pacing against the same weekday', () => {
  /** Four Wednesdays and the days between them, oldest first. */
  const rows = [
    { periodStart: '2026-09-09', orders: 10, revenue: 1000 }, // Wed
    { periodStart: '2026-09-16', orders: 20, revenue: 2000 }, // Wed
    { periodStart: '2026-09-23', orders: 30, revenue: 3000 }, // Wed
    { periodStart: '2026-09-26', orders: 99, revenue: 9900 }, // Sat — must be ignored
    { periodStart: WEDNESDAY, orders: 24, revenue: 2400 }, // Wed, today
  ]

  it('fills the quiet days the report never returned', () => {
    // sales_report() groups orders, so a day with none produces no row at all.
    // Drawing a trend straight from those rows closes the gaps and shows a shop
    // that traded every day.
    const series = dailySeries(rows, { days: 28, today: WEDNESDAY })
    const found = series.find((point) => point.date === '2026-09-10')
    expect(found).toEqual({ date: '2026-09-10', orders: 0, revenue: 0 })
  })

  it('does not invent zero days before the shop had any history', () => {
    // Counting pre-opening days as zeros would drag every average down for a
    // month after launch.
    const series = dailySeries(rows, { days: 28, today: WEDNESDAY })
    expect(series[0].date).toBe('2026-09-09')
    expect(series.some((point) => point.date < '2026-09-09')).toBe(false)
  })

  it('returns nothing at all when there is no history', () => {
    expect(dailySeries([], { days: 28, today: WEDNESDAY })).toEqual([])
    expect(dailySeries(null, { days: 28, today: WEDNESDAY })).toEqual([])
  })

  it('averages only the same weekday, ignoring the busy Saturday', () => {
    const series = dailySeries(rows, { days: 28, today: WEDNESDAY })
    const pace = pacingAgainstWeekday(series, { date: WEDNESDAY, field: 'orders' })

    expect(pace.samples).toBe(3)
    expect(pace.average).toBe(20) // (10 + 20 + 30) / 3 — the 99 is not in it
    expect(pace.value).toBe(24)
  })

  it('leaves today out of its own benchmark', () => {
    // Including it would pull the benchmark toward whatever today is doing, so
    // a record Saturday would report itself as merely average.
    const series = dailySeries(rows, { days: 28, today: WEDNESDAY })
    const pace = pacingAgainstWeekday(series, { date: WEDNESDAY, field: 'orders' })
    expect(pace.average).not.toBe((10 + 20 + 30 + 24) / 4)
  })

  it('reports no comparison at all when nothing earlier exists', () => {
    // A date before the shop's first trading day has no same-weekday history to
    // average, and saying so beats printing a confident 0%.
    const series = dailySeries(rows, { days: 28, today: WEDNESDAY })
    expect(pacingAgainstWeekday(series, { date: '2026-09-02', field: 'orders' })).toBeNull()
    expect(describePacing(null)).toEqual({ kind: 'none' })
  })

  it('separates "no history" from "history, all of it quiet"', () => {
    // Tuesdays exist in this series — at zero. That is a real benchmark and a
    // real answer, and it is NOT the same as having nothing to compare against:
    // one says "first orders on this day", the other says nothing at all.
    const series = dailySeries(rows, { days: 28, today: WEDNESDAY })
    const tuesday = pacingAgainstWeekday(series, { date: '2026-09-29', field: 'orders' })

    expect(tuesday.samples).toBeGreaterThan(0)
    expect(tuesday.average).toBe(0)
    expect(describePacing(tuesday).kind).toBe('fromNothing')
  })

  it('calls a small difference level rather than reporting it as news', () => {
    // Against the real bound, not a copy of it: trade wanders by a few percent
    // for no reason, and a dashboard reporting that as news teaches the Manager
    // to stop reading it.
    const inside = LEVEL_BAND * 0.8
    expect(describePacing({ deltaRatio: inside, samples: 4 }).kind).toBe('level')
    expect(describePacing({ deltaRatio: -inside, samples: 4 }).kind).toBe('level')
  })

  it('starts reporting the moment the difference clears that bound', () => {
    const outside = LEVEL_BAND * 1.2
    expect(describePacing({ deltaRatio: outside, samples: 4 }).kind).toBe('ahead')
    expect(describePacing({ deltaRatio: -outside, samples: 4 }).kind).toBe('behind')
  })

  it('names the direction and the size once it is worth mentioning', () => {
    expect(describePacing({ deltaRatio: 0.2, samples: 4 })).toEqual({
      kind: 'ahead',
      percent: 20,
      samples: 4,
    })
    expect(describePacing({ deltaRatio: -0.5, samples: 2 })).toEqual({
      kind: 'behind',
      percent: 50,
      samples: 2,
    })
  })

  it('refuses to divide by a usual figure of zero', () => {
    // "Up ∞%" from a standing start is not a claim worth making.
    expect(describePacing({ deltaRatio: null, samples: 3 }).kind).toBe('fromNothing')
  })
})

describe('the stock meter', () => {
  it('puts the reorder level a third of the way along', () => {
    expect(stockBar(4800, 1600).marker).toBeCloseTo(1 / FULL_AT_MULTIPLE)
  })

  it('fills proportionally below the full mark and clamps above it', () => {
    expect(stockBar(1600, 1600).fill).toBeCloseTo(1 / 3)
    expect(stockBar(4800, 1600).fill).toBe(1)
    expect(stockBar(99999, 1600).fill).toBe(1)
  })

  it('keeps the reorder mark on an empty shelf', () => {
    // The row that most needs to show how far below the line it has fallen is
    // the one that must not drop the line.
    expect(stockBar(0, 1600)).toEqual({ fill: 0, marker: 1 / FULL_AT_MULTIPLE })
  })

  it('draws no mark when no threshold was ever set', () => {
    expect(stockBar(500, 0)).toEqual({ fill: 1, marker: null })
    expect(coverRatio(500, 0)).toBeNull()
  })

  it('reports cover as a multiple of the threshold', () => {
    expect(coverRatio(8000, 1600)).toBe(5)
    expect(coverRatio(1500, 1600)).toBeCloseTo(0.9375)
  })
})

describe('quantities on screen', () => {
  it('drops the thousandths the recipes produced', () => {
    // The owner's example, exactly.
    expect(formatQuantity(8000.005, 'g')).toBe('8,000 g')
  })

  it('never renders a non-empty shelf as zero', () => {
    // "0 g" is the one reading a stock screen must not get wrong.
    expect(formatQuantity(0.004, 'g')).toBe('< 1 g')
    expect(formatQuantity(0, 'g')).toBe('0 g')
  })

  it('tells a missing figure from a zero one', () => {
    // Number(null) is 0, which is finite — so without a guard a variance nobody
    // measured prints as a confident "0 g".
    expect(formatQuantity(null, 'g')).toBe('—')
    expect(formatSignedQuantity(undefined, 'g')).toBe('—')
    expect(formatSignedQuantity(0, 'g')).toBe('0 g')
  })

  it('keeps the sign on a variance, because the sign is the meaning', () => {
    expect(formatSignedQuantity(240, 'g')).toBe('+240 g')
    expect(formatSignedQuantity(-1150, 'g')).toBe('−1,150 g')
  })

  it('stops spending decimals on a multiple that only needs to say plenty', () => {
    expect(formatMultiple(1.24)).toBe('1.2')
    expect(formatMultiple(5)).toBe('5')
    expect(formatMultiple(23.4)).toBe('23')
  })
})

describe('bulk receiving', () => {
  it('typing a quantity puts the line on the sheet', () => {
    const lines = upsertQuantity([], 'a', '500')
    expect(lines).toEqual([{ ingredientId: 'a', quantity: '500' }])
  })

  it('typing again updates rather than duplicating', () => {
    const once = upsertQuantity([], 'a', '500')
    expect(upsertQuantity(once, 'a', '600')).toEqual([{ ingredientId: 'a', quantity: '600' }])
  })

  it('clearing the box takes the line off', () => {
    // Otherwise a Manager who typed into the wrong row has no obvious undo.
    const lines = upsertQuantity([{ ingredientId: 'a', quantity: '500' }], 'a', '')
    expect(lines).toEqual([])
  })

  it('leaves the other lines alone', () => {
    const start = [
      { ingredientId: 'a', quantity: '500' },
      { ingredientId: 'b', quantity: '10' },
    ]
    expect(upsertQuantity(start, 'a', '')).toEqual([{ ingredientId: 'b', quantity: '10' }])
  })

  it('feeds the same readiness rule the side panel uses', () => {
    // One delivery, one definition of a line worth sending, whichever way it
    // was typed.
    let lines = []
    lines = upsertQuantity(lines, 'a', '500')
    lines = upsertQuantity(lines, 'b', '0')
    expect(readyLines(lines).map((l) => l.ingredientId)).toEqual(['a'])
  })
})

describe('grouping cancellations', () => {
  const rows = [
    { orderNumber: '1', reason: 'changed_mind' },
    { orderNumber: '2', reason: 'changed_mind' },
    { orderNumber: '3', reason: 'too_slow' },
    { orderNumber: '4', reason: null },
  ]

  it('counts each reason and sorts the biggest first', () => {
    const groups = groupByReason(rows)
    expect(groups[0]).toEqual({ reason: 'changed_mind', count: 2 })
  })

  it('keeps unanswered cancellations as their own group rather than dropping them', () => {
    // An order cancelled before the reason existed is still a cancellation, and
    // a breakdown that silently omits it does not add up to the total above it.
    const groups = groupByReason(rows)
    const unknown = groups.find((g) => g.reason === null)
    expect(unknown).toEqual({ reason: null, count: 1 })
    expect(groups.reduce((sum, g) => sum + g.count, 0)).toBe(rows.length)
  })

  it('returns nothing for nothing', () => {
    expect(groupByReason([])).toEqual([])
    expect(groupByReason(null)).toEqual([])
  })
})
