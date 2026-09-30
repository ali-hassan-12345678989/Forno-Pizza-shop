import { shiftDay, weekdayOf } from './shopDays'

/**
 * Is today busier or quieter than the same day usually is?
 *
 * "Orders today: 6" is a number with nothing to lean on. Six is a good Tuesday
 * and a disastrous Saturday, and the dashboard could not tell the difference.
 * This turns the figure into a comparison against the same weekday, which is
 * the only fair one a pizza shop has — every trade in this business runs on a
 * weekly cycle, so comparing Saturday to Friday says nothing useful.
 *
 * Pure, so the rules are testable without a browser or a database. Nothing here
 * invents a figure: every value comes from a row sales_report() returned, and
 * the only arithmetic is averaging rows the database already grouped — the same
 * posture as the totals strip in SalesReport.
 */

/**
 * A continuous run of days, with the quiet ones filled in.
 *
 * sales_report() groups orders, so a day nobody ordered on produces no row at
 * all — the screen calls it "last 30 days WITH orders" for exactly that reason.
 * A trend line drawn straight from those rows silently closes the gaps and
 * shows a shop that traded every day, and an average taken over them is an
 * average of good days only.
 *
 * So missing days are filled with zero, which is what actually happened. What
 * is NOT filled is anything before the first row: those days are not quiet,
 * they are days this shop had not opened yet, and counting them as zeros would
 * drag every average down for a month after launch.
 */
export function dailySeries(rows, { days, today }) {
  const byDay = new Map((rows ?? []).map((row) => [row.periodStart, row]))
  if (byDay.size === 0) return []

  const earliest = [...byDay.keys()].sort()[0]
  const series = []

  for (let back = days - 1; back >= 0; back -= 1) {
    const date = shiftDay(today, -back)
    if (!date || date < earliest) continue

    const row = byDay.get(date)
    series.push({
      date,
      orders: row ? row.orders : 0,
      revenue: row ? row.revenue : 0,
    })
  }

  return series
}

/**
 * What this weekday normally looks like, and how today compares.
 *
 * Only earlier days count. Including today in its own average would pull the
 * benchmark toward whatever today happens to be doing, so a record-breaking
 * Saturday would report itself as merely average — the comparison would flatten
 * exactly the peaks it exists to reveal.
 *
 * Returns null when there is no history to compare against, and the caller
 * shows nothing rather than a confident "0% change" invented from one sample.
 * `samples` comes back so the screen can say what the claim rests on; two
 * Wednesdays is not a pattern and the reader should be able to see that.
 */
export function pacingAgainstWeekday(series, { date, field = 'orders' } = {}) {
  const weekday = weekdayOf(date)
  if (weekday === null) return null

  const earlier = series.filter((point) => point.date < date && weekdayOf(point.date) === weekday)
  if (earlier.length === 0) return null

  const average = earlier.reduce((sum, point) => sum + point[field], 0) / earlier.length
  const today = series.find((point) => point.date === date)
  const value = today ? today[field] : 0

  return {
    value,
    average,
    samples: earlier.length,
    // Undefined rather than Infinity when the usual figure is zero: "up ∞%"
    // from a standing start is not a claim worth making, and the caller prints
    // the plain average instead.
    deltaRatio: average > 0 ? (value - average) / average : null,
  }
}

/**
 * How far from the usual a figure has to be before it is worth mentioning.
 *
 * Under this, the honest answer is "about the same". Trade varies by a few
 * percent for no reason at all, and a dashboard that reports "3% ahead" as
 * news teaches the Manager to stop reading it.
 */
export const LEVEL_BAND = 0.05

/**
 * The pacing figure turned into the one claim the screen should make.
 *
 * Kept here rather than in the component so the decision — which is a rule
 * about numbers, not about pixels — is testable without rendering anything.
 * It returns a kind and its parts; choosing the words is the copy's job.
 */
export function describePacing(pace) {
  if (!pace) return { kind: 'none' }
  if (pace.deltaRatio === null) return { kind: 'fromNothing', samples: pace.samples }

  const percent = Math.round(Math.abs(pace.deltaRatio) * 100)
  if (Math.abs(pace.deltaRatio) < LEVEL_BAND) return { kind: 'level', samples: pace.samples }

  return {
    kind: pace.deltaRatio > 0 ? 'ahead' : 'behind',
    percent,
    samples: pace.samples,
  }
}
