import { describe, expect, it } from 'vitest'
import { waitingMinutes } from '../src/lib/waitingMinutes.js'

/**
 * How long an order has been waiting.
 *
 * `now` is passed in rather than read from the clock, so this is testable
 * without freezing time. The case that matters is the one a naive subtraction
 * gets wrong: the database clock and the browser clock always disagree a
 * little, and an order created "in the future" must not read as -1 min.
 */

const NOW = Date.UTC(2026, 8, 23, 19, 30, 0)
const at = (mins) => new Date(NOW - mins * 60_000).toISOString()

describe('minutes waited', () => {
  it('counts whole minutes', () => {
    expect(waitingMinutes(at(14), NOW)).toBe(14)
    expect(waitingMinutes(at(1), NOW)).toBe(1)
  })

  it('rounds down, so 119 seconds is one minute and not two', () => {
    expect(waitingMinutes(new Date(NOW - 119_000).toISOString(), NOW)).toBe(1)
  })

  it('is zero for an order placed a moment ago', () => {
    expect(waitingMinutes(at(0), NOW)).toBe(0)
    expect(waitingMinutes(new Date(NOW - 59_000).toISOString(), NOW)).toBe(0)
  })

  it('never goes negative when the clocks disagree', () => {
    // The database stamps created_at; the browser does the arithmetic. They are
    // never exactly in step, and "-1 min" on a kitchen screen reads as a bug.
    expect(waitingMinutes(new Date(NOW + 30_000).toISOString(), NOW)).toBe(0)
    expect(waitingMinutes(new Date(NOW + 10 * 60_000).toISOString(), NOW)).toBe(0)
  })

  it('survives a value that is not a date', () => {
    expect(waitingMinutes('not a date', NOW)).toBe(0)
    expect(waitingMinutes(null, NOW)).toBe(0)
    expect(waitingMinutes(undefined, NOW)).toBe(0)
  })

  it('handles a long wait', () => {
    expect(waitingMinutes(at(125), NOW)).toBe(125)
  })
})
