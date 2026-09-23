/**
 * How long an order has been waiting, in whole minutes.
 *
 * Pure and takes `now` explicitly rather than reading the clock itself, so the
 * kitchen screen's "14 min" is testable without freezing time globally.
 *
 * Clamped at zero: a row whose created_at is a second or two in the future —
 * which happens when the database clock and the browser clock disagree, and
 * they always do a little — must read "just now" rather than "-1 min".
 */
export function waitingMinutes(placedAt, now = Date.now()) {
  // Null is checked before parsing, not after. `new Date(null)` is the epoch —
  // a perfectly valid date in 1970 — so a NaN check alone lets a missing
  // timestamp through and puts "29836530 min" on the kitchen screen.
  if (placedAt === null || placedAt === undefined) return 0

  const started = new Date(placedAt).getTime()
  if (Number.isNaN(started)) return 0

  return Math.max(0, Math.floor((now - started) / 60_000))
}
