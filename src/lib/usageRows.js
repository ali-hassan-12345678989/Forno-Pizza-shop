/**
 * Reading the usage table.
 *
 * Pure, so the rules are testable without a browser or a database. What is
 * deliberately NOT here is any arithmetic on the figures themselves:
 * staff_usage_between() nets cancellations off, separates deliveries from
 * consumption and cuts both ends of the window in the shop's time zone.
 * Recomputing any of that in the browser would create a second opinion able to
 * disagree with the sales report it is meant to be cross-checked against.
 */

/**
 * Rows worth showing.
 *
 * An ingredient with no movement at all is still in the list — that it has not
 * moved is itself the answer, and hiding it would make the screen disagree with
 * the stock table about how many ingredients the shop has. `onlyUsed` is the
 * filter for the other question: what is actually moving.
 *
 * `onlyVariance` is the question this screen exists to answer since counting
 * went in: where do the books and the shelf disagree. It keeps counted rows
 * only, and only those that came out wrong — a shelf that counted clean is good
 * news and belongs in the full list, not in a list of problems.
 */
export function visibleRows(rows, { query = '', onlyUsed = false, onlyVariance = false } = {}) {
  const needle = String(query ?? '')
    .trim()
    .toLowerCase()

  return (rows ?? []).filter((row) => {
    if (needle && !row.name.toLowerCase().includes(needle)) return false
    if (onlyVariance) return row.variance !== null && row.variance !== 0
    if (onlyUsed && row.used <= 0) return false
    return true
  })
}

/** How many ingredients moved at all in the window. */
export function movedCount(rows) {
  return (rows ?? []).filter((row) => row.used > 0).length
}

/** How many came back from a count disagreeing with the books. */
export function varianceCount(rows) {
  return (rows ?? []).filter((row) => row.variance !== null && row.variance !== 0).length
}

/** How many were counted at all. Zero means the variance column is empty by default, not broken. */
export function countedCount(rows) {
  return (rows ?? []).filter((row) => row.countsTaken > 0).length
}

/**
 * The share of the window's busiest row that one row accounts for, 0..1.
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
export function shareOfBusiest(rows) {
  const peak = Math.max(0, ...(rows ?? []).map((row) => row.used))
  if (peak <= 0) return () => 0
  return (row) => Math.max(0, row.used) / peak
}
