import { shiftDay, weekdayOf } from './shopDays'

/**
 * The windows the usage screen can be read over.
 *
 * WHY "ALL TIME" WENT. The owner's review put it bluntly: all-time usage is
 * virtually useless for inventory management, and they are right for a reason
 * worth writing down. Usage is only worth anything when it can be reconciled
 * against a physical count, and a count covers a period — count the shelf on
 * Monday, count it again the following Monday, and the week between them is a
 * closed set of books. All-time can never be reconciled against anything,
 * because nobody has ever counted "all time". It grows forever and answers no
 * question anybody asks at a shelf.
 *
 * Pure, so the rules are testable without a browser or a database. Everything
 * returned is a pair of shop calendar dates, inclusive at both ends, which is
 * exactly what staff_usage_between() takes.
 */

/**
 * Which day a week starts on, 0 = Sunday.
 *
 * Monday, the accounting convention — a week that runs Monday to Sunday keeps
 * a weekend together, and splitting Saturday from Sunday would put the two
 * busiest days of a pizza shop's week in different reports.
 */
export const WEEK_STARTS_ON = 1

export const RANGE_IDS = {
  today: 'today',
  weekToDate: 'weekToDate',
  priorWeek: 'priorWeek',
  last7: 'last7',
  last30: 'last30',
  custom: 'custom',
}

/** The presets, in the order they are offered. `custom` is not one — it is the escape hatch. */
export const PRESET_RANGES = [
  RANGE_IDS.today,
  RANGE_IDS.weekToDate,
  RANGE_IDS.priorWeek,
  RANGE_IDS.last7,
  RANGE_IDS.last30,
]

export const DEFAULT_RANGE = RANGE_IDS.today

/** The first day of the week `dayKey` falls in. */
export function startOfWeek(dayKey) {
  const weekday = weekdayOf(dayKey)
  if (weekday === null) return null

  // (weekday - WEEK_STARTS_ON + 7) % 7 is how many days we are INTO the week,
  // and the +7 is what keeps it positive when the week starts after the day —
  // Sunday with a Monday-based week is six days in, not minus one.
  return shiftDay(dayKey, -((weekday - WEEK_STARTS_ON + 7) % 7))
}

/**
 * A preset turned into the two dates it means, relative to the shop's today.
 *
 * `priorWeek` is the whole of last week, not the last seven days. That is the
 * distinction that makes it useful: a complete Monday-to-Sunday is a period
 * somebody can have counted stock at both ends of, whereas a rolling seven days
 * ends in the middle of one.
 */
export function rangeFor(id, today) {
  const weekStart = startOfWeek(today)

  switch (id) {
    case RANGE_IDS.today:
      return { from: today, to: today }

    case RANGE_IDS.weekToDate:
      return { from: weekStart, to: today }

    case RANGE_IDS.priorWeek:
      return { from: shiftDay(weekStart, -7), to: shiftDay(weekStart, -1) }

    case RANGE_IDS.last7:
      // Six back plus today is seven days. Seven back would be eight.
      return { from: shiftDay(today, -6), to: today }

    case RANGE_IDS.last30:
      return { from: shiftDay(today, -29), to: today }

    default:
      return null
  }
}

/**
 * Whether a hand-typed pair is something the database will accept.
 *
 * Mirrors the guards in staff_usage_between(): both present, in order, and no
 * longer than a year. Checked here as well as there so a typo is answered
 * immediately rather than after a round trip — and there as well as here,
 * because the browser is not what enforces it.
 */
export const MAX_RANGE_DAYS = 366

export function isValidRange(from, to) {
  if (!from || !to) return false
  if (to < from) return false

  const span = daysBetween(from, to)
  return span !== null && span <= MAX_RANGE_DAYS
}

/** How many days from `from` to `to`, counting neither end twice. */
export function daysBetween(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null

  return Math.round((b - a) / 86400000)
}
