/**
 * Shop days, as plain calendar dates.
 *
 * Every time-based figure in this system is cut in the shop's own zone — the
 * sales report, the usage ledger and the day-part breakdown all say so out
 * loud — so the browser needs one place that agrees with them about where a
 * day starts. Dates here are strings of the form '2026-09-30', which is both
 * sortable and exactly the shape the database returns, so two of them can be
 * compared directly and never through a Date.
 *
 * Nothing here parses a date key with new Date(). new Date('2026-09-30') is
 * UTC midnight, which is the previous day for any reader west of Greenwich —
 * the one bug this module exists to make unrepeatable.
 */

/**
 * One calendar day in the shop's own zone, as '2026-09-30'.
 *
 * en-CA because it formats as YYYY-MM-DD, which is both sortable and exactly
 * the shape sales_report() already returns, so the two can be compared as
 * plain strings and never through a Date.
 */
export function shopDayKey(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * Which day of the week a calendar date falls on, 0–6.
 *
 * Built through Date.UTC from the parts rather than new Date('2026-09-30'),
 * which parses as UTC midnight and reports the previous weekday for any reader
 * west of Greenwich. The key is already a shop-local calendar date; treating it
 * as a pure calendar fact is what keeps it one.
 */
export function weekdayOf(dayKey) {
  const [y, m, d] = String(dayKey).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** The calendar day `offset` days before `dayKey`, same shape. */
export function shiftDay(dayKey, offset) {
  const [y, m, d] = String(dayKey).split('-').map(Number)
  if (!y || !m || !d) return null
  const at = new Date(Date.UTC(y, m - 1, d))
  at.setUTCDate(at.getUTCDate() + offset)
  return at.toISOString().slice(0, 10)
}
