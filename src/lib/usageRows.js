import { USAGE_PERIODS } from '../config/usage'

/**
 * Reading the usage table.
 *
 * Pure, so the rules are testable without a browser or a database. What is
 * deliberately NOT here is any arithmetic on the figures themselves:
 * staff_ingredient_usage() nets cancellations off, excludes deliveries and cuts
 * the day in the shop's time zone. Recomputing any of that in the browser would
 * create a second opinion able to disagree with the sales report it is meant to
 * be cross-checked against.
 */

/** Which of the two figures a row is being read for. */
export function usedIn(row, period) {
  return period === USAGE_PERIODS.total ? row.usedTotal : row.usedToday
}

/**
 * Rows worth showing for the chosen window.
 *
 * An ingredient with no movement at all is still in the list — that it has not
 * moved is itself the answer, and hiding it would make the screen disagree with
 * the stock table about how many ingredients the shop has. `onlyUsed` is the
 * filter for the other question: what is actually moving.
 */
export function visibleRows(
  rows,
  { period = USAGE_PERIODS.today, query = '', onlyUsed = false } = {},
) {
  const needle = String(query ?? '')
    .trim()
    .toLowerCase()

  return (rows ?? []).filter((row) => {
    if (needle && !row.name.toLowerCase().includes(needle)) return false
    if (onlyUsed && usedIn(row, period) <= 0) return false
    return true
  })
}

/** How many ingredients moved at all in the chosen window. */
export function movedCount(rows, period) {
  return (rows ?? []).filter((row) => usedIn(row, period) > 0).length
}

/**
 * The share of the window's total that one row accounts for, 0..1.
 *
 * Used only to size the bar beside each figure, which is why it is a share of
 * the largest row rather than of the sum: a bar that fills the width for the
 * busiest ingredient reads at a glance, whereas shares of a total are all
 * slivers once there are thirty of them.
 *
 * Returns 0 rather than dividing by zero on a day nothing has been used, and
 * ignores units entirely — 20,000 g of dough and 40 pcs of buns are different
 * quantities of different things, and the bar only ranks within one column.
 */
export function shareOfBusiest(rows, period) {
  const peak = Math.max(0, ...(rows ?? []).map((row) => usedIn(row, period)))
  if (peak <= 0) return () => 0
  return (row) => Math.max(0, usedIn(row, period)) / peak
}
