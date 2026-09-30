/**
 * Reading the cancellations behind the summary figure.
 *
 * The owner's review read "168 cancelled against 6 successful" as a business
 * emergency. It was not — those were the regression suite's test orders, and
 * the go-live reset has since cleared them. But the reaction was the right one
 * to design for: a number that large should be something you can open, not
 * something you have to take on trust. This is what opens it.
 *
 * Pure, so the rules are testable without a browser or a database. The rows it
 * groups are the same rows the list underneath renders, so the breakdown and
 * the detail can never describe different sets of orders.
 */

/**
 * How many cancellations fall under each reason, commonest first.
 *
 * A cancellation with no reason is its own group rather than being dropped.
 * Every order cancelled before the reason column existed has none, as does
 * anybody who declined to answer, and a breakdown that quietly omitted them
 * would not add up to the total printed above it — which is exactly the kind of
 * disagreement between two figures on one screen that destroys trust in both.
 */
export function groupByReason(rows) {
  const counts = new Map()

  for (const row of rows ?? []) {
    const reason = row.reason ?? null
    counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      // Unanswered last among equals: it is the least informative group and
      // should not lead a breakdown it cannot explain.
      if (a.reason === null) return 1
      if (b.reason === null) return -1
      return String(a.reason).localeCompare(String(b.reason))
    })
}
