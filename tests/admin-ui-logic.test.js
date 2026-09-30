import { describe, expect, it } from 'vitest'
import {
  MIX_CLASSES,
  classifyMix,
  countByClass,
  marginPerUnit,
  median,
} from '../src/lib/productMix'
import { SLA_STATES, lateOrders, promisedMinutes, slaFor } from '../src/lib/sla'
import { FALLBACK_SLA_MINUTES, SLA_WARN_AT } from '../src/config/sla'
import { escapeCell, toCsv } from '../src/lib/csv'
import { formatDuration, formatPriceOrUnknown } from '../src/lib/format'

/**
 * The rules behind the Admin work, tested without a browser or a database.
 *
 * One idea runs through all of it: an unknown figure is not a zero. The shop
 * opens with no ingredient priced, so "unknown" is the normal state of every
 * cost, margin and verdict here for as long as it takes somebody to fill them
 * in — and a report that rendered unknown as zero would be at its most
 * confident exactly when it knew least.
 */

describe('what a promise means', () => {
  it('reads the upper bound of a range, not the lower', () => {
    // "25–35 min" promises thirty-five. Judging against twenty-five would flag
    // as late every order that arrived inside the window the customer was
    // actually given, and a board that cries wolf gets ignored.
    expect(promisedMinutes('25–35 min')).toBe(35)
    expect(promisedMinutes('30-45 minutes')).toBe(45)
  })

  it('reads a single figure', () => {
    expect(promisedMinutes('15 min')).toBe(15)
  })

  it('refuses to guess when there is no number', () => {
    expect(promisedMinutes('as soon as we can')).toBeNull()
    expect(promisedMinutes('')).toBeNull()
    expect(promisedMinutes(null)).toBeNull()
  })
})

describe('which orders are late', () => {
  const settings = { deliveryEta: '25–35 min', pickupEta: '15 min' }
  const now = Date.parse('2026-09-30T12:00:00Z')
  const at = (minutesAgo) => new Date(now - minutesAgo * 60000).toISOString()

  const order = (o) => ({ id: o.id ?? '1', isActive: true, fulfillmentType: 'delivery', ...o })

  it('judges a delivery against the delivery promise and a pickup against its own', () => {
    // 20 minutes is fine for a 35-minute delivery and late for a 15-minute
    // pickup. One deadline for both would be wrong for one of them always.
    const deliverySla = slaFor(order({ placedAt: at(20) }), { settings, now })
    const pickupSla = slaFor(order({ placedAt: at(20), fulfillmentType: 'pickup' }), {
      settings,
      now,
    })

    expect(deliverySla.state).not.toBe(SLA_STATES.late)
    expect(pickupSla.state).toBe(SLA_STATES.late)
  })

  it('warns before the deadline rather than only after it', () => {
    // Early enough that somebody can still do something about it.
    const justInside = 35 * SLA_WARN_AT + 1
    expect(slaFor(order({ placedAt: at(justInside) }), { settings, now }).state).toBe(
      SLA_STATES.due,
    )
  })

  it('ignores an order that has already finished', () => {
    // This board exists to dispatch somebody, not to keep score.
    expect(slaFor(order({ placedAt: at(300), isActive: false }), { settings, now })).toBeNull()
  })

  it('falls back when the promise cannot be read, and says that it did', () => {
    const sla = slaFor(order({ placedAt: at(50) }), { settings: { deliveryEta: 'soon' }, now })
    expect(sla.limitMinutes).toBe(FALLBACK_SLA_MINUTES.delivery)
    expect(sla.assumed).toBe(true)
  })

  it('does not claim a deadline is assumed when it came from the shop', () => {
    expect(slaFor(order({ placedAt: at(50) }), { settings, now }).assumed).toBe(false)
  })

  it('sorts the worst offender first, not the oldest order', () => {
    // A pickup 20 minutes past a 15-minute promise is a bigger failure than a
    // delivery 5 minutes past a 35-minute one, even though it is newer.
    const rows = [
      order({ id: 'delivery', placedAt: at(40) }), // 5 over
      order({ id: 'pickup', placedAt: at(35), fulfillmentType: 'pickup' }), // 20 over
    ]
    expect(lateOrders(rows, { settings, now }).map((r) => r.order.id)).toEqual([
      'pickup',
      'delivery',
    ])
  })

  it('survives a malformed timestamp instead of reporting it as infinitely late', () => {
    expect(slaFor(order({ placedAt: 'not-a-date' }), { settings, now })).toBeNull()
  })
})

describe('the product mix', () => {
  const item = (name, quantity, margin, costsKnown = true) => ({
    id: name,
    name,
    quantity,
    revenue: quantity * 1000,
    foodCost: costsKnown ? quantity * 300 : null,
    margin: costsKnown ? margin : null,
    costsKnown,
  })

  it('takes the median, not the mean', () => {
    // One runaway best-seller drags a mean above almost every other item, and a
    // menu where nine dishes in ten are "below average" has said nothing.
    expect(median([1, 2, 3, 100])).toBe(2.5)
    expect(median([5])).toBe(5)
    expect(median([])).toBeNull()
  })

  it('ranks by margin PER UNIT, not by total margin', () => {
    // Total margin is volume counted twice: every high-selling item would land
    // in the same corner however thin it actually is.
    expect(marginPerUnit({ quantity: 10, margin: 500 })).toBe(50)
    expect(marginPerUnit({ quantity: 0, margin: 500 })).toBeNull()
    expect(marginPerUnit({ quantity: 10, margin: null })).toBeNull()
  })

  it('puts a high-volume, high-margin item in the stars', () => {
    const rows = [
      item('Star', 100, 100 * 700),
      item('Plowhorse', 100, 100 * 100),
      item('Puzzle', 5, 5 * 700),
      item('Dog', 5, 5 * 100),
    ]
    const byName = Object.fromEntries(classifyMix(rows).map((r) => [r.name, r.mixClass]))

    expect(byName.Star).toBe(MIX_CLASSES.star)
    expect(byName.Plowhorse).toBe(MIX_CLASSES.plowhorse)
    expect(byName.Puzzle).toBe(MIX_CLASSES.puzzle)
    expect(byName.Dog).toBe(MIX_CLASSES.dog)
  })

  it('refuses to classify an item nobody has costed', () => {
    /* Guessing a quadrant from a missing price is how a pizza gets taken off a
       menu for being a dog when nobody had ever priced its cheese. */
    const rows = [item('Known', 50, 50 * 400), item('Unpriced', 50, null, false)]
    const byName = Object.fromEntries(classifyMix(rows).map((r) => [r.name, r.mixClass]))

    expect(byName.Unpriced).toBe(MIX_CLASSES.unknown)
    expect(byName.Known).not.toBe(MIX_CLASSES.unknown)
  })

  it('keeps an uncosted item out of the medians that judge the others', () => {
    /* Otherwise the lines dividing the menu would move as prices were entered,
       and yesterday's stars would silently become today's plowhorses with no
       sale having changed. */
    const withoutIt = classifyMix([item('A', 10, 10 * 100), item('B', 90, 90 * 900)])
    const withIt = classifyMix([
      item('A', 10, 10 * 100),
      item('B', 90, 90 * 900),
      item('C', 1000, null, false),
    ])

    const classOf = (rows, name) => rows.find((r) => r.name === name).mixClass
    expect(classOf(withIt, 'A')).toBe(classOf(withoutIt, 'A'))
    expect(classOf(withIt, 'B')).toBe(classOf(withoutIt, 'B'))
  })

  it('does not call a two-item menu all dogs', () => {
    // At the median exactly counts as the better side. Otherwise both items sit
    // below their own midpoint, which is the kind of answer that discredits a
    // report entirely.
    const classes = classifyMix([item('A', 10, 10 * 100), item('B', 10, 10 * 100)]).map(
      (r) => r.mixClass,
    )
    expect(classes.every((c) => c === MIX_CLASSES.star)).toBe(true)
  })

  it('classifies nothing when nothing can be costed', () => {
    const rows = [item('A', 10, null, false), item('B', 20, null, false)]
    expect(countByClass(classifyMix(rows))[MIX_CLASSES.unknown]).toBe(2)
  })

  it('survives being handed nothing', () => {
    expect(classifyMix(null)).toEqual([])
    expect(countByClass(null)[MIX_CLASSES.star]).toBe(0)
  })
})

describe('the CSV export', () => {
  it('quotes a value containing a comma, so the row does not gain a column', () => {
    // A customer called "Khan, Ali" would otherwise shift every figure on that
    // row one place left — worse than no export, because the file still opens.
    expect(escapeCell('Khan, Ali')).toBe('"Khan, Ali"')
  })

  it('doubles an embedded quote rather than ending the field', () => {
    expect(escapeCell('12" pizza')).toBe('"12"" pizza"')
  })

  it('quotes a value containing a newline', () => {
    expect(escapeCell('Flat 3\nF-7')).toBe('"Flat 3\nF-7"')
  })

  it('leaves an ordinary value alone', () => {
    expect(escapeCell('Chicken Tikka')).toBe('Chicken Tikka')
    expect(escapeCell(1250)).toBe('1250')
  })

  it('writes an empty cell for a missing value rather than the word null', () => {
    expect(escapeCell(null)).toBe('')
    expect(escapeCell(undefined)).toBe('')
  })

  it('writes the columns the caller asked for, in that order', () => {
    // Not whatever order the object's keys happen to be in — not something to
    // leave to chance in a file somebody reconciles accounts from.
    const csv = toCsv(
      [{ b: 2, a: 1 }],
      [
        { key: 'a', header: 'First' },
        { key: 'b', header: 'Second' },
      ],
    )
    expect(csv).toBe('First,Second\r\n1,2')
  })

  it('still writes a header when there are no rows', () => {
    expect(toCsv([], [{ key: 'a', header: 'First' }])).toBe('First')
  })
})

describe('figures that may not be known', () => {
  it('says so rather than printing zero', () => {
    // "This pizza costs nothing to make" is the single most misleading thing a
    // margin screen could say, and unpriced is the shop's starting state.
    expect(formatPriceOrUnknown(null, 'not priced')).toBe('not priced')
    expect(formatPriceOrUnknown(undefined, 'not priced')).toBe('not priced')
    expect(formatPriceOrUnknown(0, 'not priced')).toBe('Rs. 0')
  })

  it('tells an untimed stage from an instant one', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(0)).toBe('0 s')
  })

  it('says a duration the way somebody would say it', () => {
    expect(formatDuration(45)).toBe('45 s')
    expect(formatDuration(600)).toBe('10 min')
    expect(formatDuration(4320)).toBe('1 h 12 m')
    expect(formatDuration(3600)).toBe('1 h')
  })
})
