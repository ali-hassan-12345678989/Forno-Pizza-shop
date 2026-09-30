/**
 * Menu engineering: which items are worth selling.
 *
 * The classic four-way split, and the owner asked for it by name. Each item is
 * compared against the middle of the menu on two axes — how much it sells, and
 * how much it makes per sale — which gives four quadrants:
 *
 *   STAR       sells well, makes money       — protect it, never discount it
 *   PLOWHORSE  sells well, makes little      — raise the price or cut the cost
 *   PUZZLE     sells badly, makes money      — push it; the margin is there
 *   DOG        sells badly, makes little     — the candidate for removal
 *
 * THE MEDIAN, NOT THE MEAN. One runaway best-seller drags a mean above almost
 * every other item, and a menu where nine dishes out of ten are "below average"
 * has told you nothing. The median splits the menu in half by construction,
 * which is what a comparison against the rest of the menu should do.
 *
 * Pure, so the rules are testable without a browser or a database. The
 * measurements come from admin_product_mix(); this only sorts them.
 */

export const MIX_CLASSES = {
  star: 'star',
  plowhorse: 'plowhorse',
  puzzle: 'puzzle',
  dog: 'dog',
  unknown: 'unknown',
}

/** The middle value, or the mean of the middle two. Null for nothing. */
export function median(values) {
  const sorted = (values ?? []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (sorted.length === 0) return null

  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Margin per unit sold, which is the axis that matters.
 *
 * NOT total margin: that would be volume counted twice, and every high-selling
 * item would land in the same corner however thin it actually is. What
 * separates a star from a plowhorse is what each pizza makes, not what the
 * queue for it made.
 */
export function marginPerUnit(row) {
  if (!row || row.margin === null || row.margin === undefined) return null
  if (!row.quantity) return null
  return row.margin / row.quantity
}

/**
 * Classifies every item against the median of the others.
 *
 * ITEMS WITH NO KNOWN COST ARE NOT CLASSIFIED, and they are not quietly left
 * out either. Guessing a quadrant from a missing price is how an item gets
 * taken off a menu for being a dog when nobody had ever priced its cheese, so
 * they come back as `unknown` and the screen lists them as needing a price.
 *
 * They are also excluded from the medians. Including them would mean the lines
 * dividing the menu moved as prices were entered, and yesterday's stars would
 * silently become today's plowhorses with no sale having changed.
 */
export function classifyMix(rows) {
  const known = (rows ?? []).filter((row) => row.costsKnown && marginPerUnit(row) !== null)

  const midVolume = median(known.map((row) => row.quantity))
  const midMargin = median(known.map((row) => marginPerUnit(row)))

  return (rows ?? []).map((row) => {
    const perUnit = marginPerUnit(row)

    if (!row.costsKnown || perUnit === null || midVolume === null || midMargin === null) {
      return { ...row, marginPerUnit: perUnit, mixClass: MIX_CLASSES.unknown }
    }

    /* At the median exactly counts as the better side. A menu of two items
       would otherwise put both below their own midpoint and call the whole
       menu dogs, which is the kind of answer that discredits the report. */
    const sells = row.quantity >= midVolume
    const earns = perUnit >= midMargin

    return {
      ...row,
      marginPerUnit: perUnit,
      mixClass: sells
        ? earns
          ? MIX_CLASSES.star
          : MIX_CLASSES.plowhorse
        : earns
          ? MIX_CLASSES.puzzle
          : MIX_CLASSES.dog,
    }
  })
}

/** How many items fall in each class, for the summary line. */
export function countByClass(classified) {
  const counts = Object.fromEntries(Object.values(MIX_CLASSES).map((k) => [k, 0]))
  for (const row of classified ?? []) counts[row.mixClass] += 1
  return counts
}
