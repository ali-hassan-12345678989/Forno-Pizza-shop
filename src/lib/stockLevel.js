/**
 * How full a shelf looks.
 *
 * The owner's review: nobody should have to hold "8,000.005 g" and "1,600 g" in
 * their head and work out whether one is close to the other. A bar answers it
 * without arithmetic.
 *
 * WHAT THIS DOES NOT DO IS DECIDE WHETHER AN INGREDIENT IS LOW. That belongs to
 * staff_ingredients(), which is also what fires the actual alerts, and a second
 * opinion computed in the browser would eventually disagree with it — a row
 * painted amber while the alerts list stayed silent, or the reverse. The colour
 * on screen comes from `is_low` and `is_out` as it always has. This only sizes
 * the bar and says where the threshold sits on it.
 */

/**
 * Where "full" is, as a multiple of the low-stock threshold.
 *
 * A threshold is a low-water mark, not a capacity — the database never records
 * how much of anything the shop can hold, so the bar needs a scale from
 * somewhere. Three times the threshold is the choice, and it is a choice worth
 * stating: it puts the threshold a third of the way along, which leaves two
 * thirds of the bar to show an ingredient draining towards it. A scale of
 * exactly one threshold would show every healthy ingredient pinned at full and
 * reveal nothing until the moment it was already too late.
 */
export const FULL_AT_MULTIPLE = 3

/**
 * The bar for one ingredient: how much to fill, and where to mark the
 * threshold.
 *
 * `fill` and `marker` are both 0–1 so the component can hand them straight to
 * CSS as percentages without doing arithmetic of its own.
 *
 * An ingredient with no threshold set gets no marker — there is no line to
 * draw — and reads as full whenever it has any stock at all. That is the honest
 * rendering of "nobody said what low means for this one", and it matches what
 * the status pill beside it will say, because the database cannot call it low
 * either.
 */
export function stockBar(stock, threshold) {
  const have = Number(stock)
  const low = Number(threshold)

  /* The marker depends only on whether a threshold exists — never on the level.
     Deciding it from the stock as well put an empty shelf and a nearly empty
     one in different bars: one showed the reorder line, the other did not, and
     the row that most needed to show how far below the line it had fallen was
     the one that dropped the line. */
  const marker = Number.isFinite(low) && low > 0 ? 1 / FULL_AT_MULTIPLE : null

  if (!Number.isFinite(have) || have <= 0) return { fill: 0, marker }
  if (marker === null) return { fill: 1, marker: null }

  return { fill: Math.min(have / (low * FULL_AT_MULTIPLE), 1), marker }
}

/**
 * How many times over its threshold an ingredient is stocked, for the label
 * beside the bar.
 *
 * Reads as "2.4× the reorder level", which is the sentence a Manager would say
 * out loud. Null when there is no threshold to be a multiple of.
 */
export function coverRatio(stock, threshold) {
  const have = Number(stock)
  const low = Number(threshold)

  if (!Number.isFinite(have) || !Number.isFinite(low) || low <= 0) return null

  return have / low
}
