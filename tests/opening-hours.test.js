/**
 * The shop's opening hours, on both sides of the wire.
 *
 * Postgres decides whether an order is accepted — shop_is_open() and a trigger
 * on the orders table. `src/lib/openingHours.js` is a mirror, so the customer
 * is told before they build a cart rather than after they press the button.
 *
 * A mirror that has drifted is worse than no mirror: it either hides an open
 * shop or advertises a closed one. The parity block at the end is what keeps
 * them in step, the same way validation-parity.test.js holds the checkout rules
 * against place_order().
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isShopOpen, formatShopTime, SHOP_TIME_ZONE } from '../src/lib/openingHours.js'

/** A real instant, expressed as the Karachi wall-clock time it corresponds to. */
const at = (utc) => new Date(utc)

const AFTERNOON = at('2026-09-28T09:30:00Z') // 14:30 PKT
const SMALL_HOURS = at('2026-09-28T23:30:00Z') // 04:30 PKT, next day
const ELEVEN_PM = at('2026-09-28T18:00:00Z') // 23:00 PKT exactly
const NOON = at('2026-09-28T07:00:00Z') // 12:00 PKT exactly

describe('an ordinary daytime window', () => {
  const shop = { opensAt: '12:00', closesAt: '23:00' }

  it('is open in the afternoon', () => {
    expect(isShopOpen(shop, AFTERNOON)).toBe(true)
  })

  it('is shut at half four in the morning', () => {
    expect(isShopOpen(shop, SMALL_HOURS)).toBe(false)
  })

  it('opens exactly on the hour — the start is inclusive', () => {
    expect(isShopOpen(shop, NOON)).toBe(true)
  })

  it('is already shut at exactly closing time — the end is exclusive', () => {
    // A shop closing at 23:00 is not taking orders at 23:00:00.
    expect(isShopOpen(shop, ELEVEN_PM)).toBe(false)
  })
})

describe('a window that crosses midnight', () => {
  /**
   * The case the obvious implementation gets wrong. `current >= opens && current
   * < closes` is false for every hour of the night when opens is 18:00 and
   * closes is 06:00, so a late-night shop would refuse every order it exists to
   * take.
   */
  const shop = { opensAt: '18:00', closesAt: '06:00' }

  it('is open at half four in the morning, which is inside it', () => {
    expect(isShopOpen(shop, SMALL_HOURS)).toBe(true)
  })

  it('is shut in the afternoon, which is outside it', () => {
    expect(isShopOpen(shop, AFTERNOON)).toBe(false)
  })

  it('is open at 11pm', () => {
    expect(isShopOpen(shop, ELEVEN_PM)).toBe(true)
  })
})

describe('the master switch', () => {
  it('beats an open window', () => {
    expect(isShopOpen({ opensAt: '00:00', closesAt: '00:00', acceptsOrders: false })).toBe(false)
  })

  it('a holiday closes a shop that would otherwise be trading', () => {
    expect(
      isShopOpen({ opensAt: '12:00', closesAt: '23:00', acceptsOrders: false }, AFTERNOON),
    ).toBe(false)
  })

  it('defaults to on when absent, so a database without the column still trades', () => {
    expect(isShopOpen({ opensAt: '12:00', closesAt: '23:00' }, AFTERNOON)).toBe(true)
  })
})

describe('equal times mean open around the clock', () => {
  // The shipped default, and the behaviour before opening hours existed.
  it.each([AFTERNOON, SMALL_HOURS, NOON, ELEVEN_PM])('open at %s', (when) => {
    expect(isShopOpen({ opensAt: '00:00', closesAt: '00:00' }, when)).toBe(true)
  })
})

describe('unreadable values fail open, not closed', () => {
  /**
   * Refusing every order on the strength of a value we could not parse would
   * be the worse failure — the shop loses money and nobody knows why. The
   * database still has the final say either way.
   */
  it.each([
    ['missing', {}],
    ['null', { opensAt: null, closesAt: null }],
    ['nonsense', { opensAt: 'lunchtime', closesAt: 'late' }],
    ['out of range', { opensAt: '99:00', closesAt: '12:00' }],
  ])('%s', (_label, shop) => {
    expect(isShopOpen(shop, SMALL_HOURS)).toBe(true)
  })
})

describe('seconds on the time are tolerated', () => {
  it('Postgres returns "23:00:00", not "23:00"', () => {
    expect(isShopOpen({ opensAt: '12:00:00', closesAt: '23:00:00' }, AFTERNOON)).toBe(true)
    expect(isShopOpen({ opensAt: '12:00:00', closesAt: '23:00:00' }, SMALL_HOURS)).toBe(false)
  })
})

describe('telling the customer when to come back', () => {
  it.each([
    ['12:00', '12pm'],
    ['00:00', '12am'],
    ['23:00', '11pm'],
    ['09:30', '9:30am'],
    ['18:45', '6:45pm'],
    ['13:00', '1pm'],
  ])('%s reads as %s', (value, expected) => {
    expect(formatShopTime(value)).toBe(expected)
  })

  it('gives nothing rather than nonsense for an unreadable time', () => {
    expect(formatShopTime('later')).toBe('')
    expect(formatShopTime(null)).toBe('')
  })
})

describe('parity with the database', () => {
  /**
   * Not a behavioural test — a test that the two implementations still describe
   * the same rule. If someone changes one of these branches, this fails and
   * points at the other.
   */
  const sql = readFileSync(join(import.meta.dirname, '..', 'supabase', 'opening_hours.sql'), 'utf8')

  it('both use the shop zone, and only that zone', () => {
    expect(sql).toContain(SHOP_TIME_ZONE)
    expect(SHOP_TIME_ZONE).toBe('Asia/Karachi')
  })

  it('the SQL treats equal times as always open', () => {
    expect(sql).toMatch(/when\s+s\.opens_at\s*=\s*s\.closes_at\s+then\s+true/)
  })

  it('the SQL uses an exclusive end on the ordinary window', () => {
    // `< s.closes_at`, never `<=`. A `<=` here accepts an order at closing time.
    expect(sql).toMatch(/local_now\s*>=\s*s\.opens_at\s+and\s+local_now\s*<\s*s\.closes_at/)
    expect(sql).not.toMatch(/local_now\s*<=\s*s\.closes_at/)
  })

  it('the SQL uses OR for the midnight-crossing window, not AND', () => {
    expect(sql).toMatch(/local_now\s*>=\s*s\.opens_at\s+or\s+local_now\s*<\s*s\.closes_at/)
  })

  it('the SQL honours the master switch', () => {
    expect(sql).toMatch(/s\.accepts_orders\s*\n?\s*and/)
  })

  it('the refusal raises the code the client maps', () => {
    expect(sql).toContain("raise exception 'shop_closed'")
  })

  it('the trigger fires before insert on orders, so every path is covered', () => {
    expect(sql).toMatch(/before insert on public\.orders/)
  })
})
