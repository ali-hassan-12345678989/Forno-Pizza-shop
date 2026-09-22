/**
 * The one question the Admin actually asks about an item, and the two columns
 * that answer it.
 *
 * The database stores is_active and is_sold_out. Put on screen as two tickboxes
 * they make four combinations, one of which — inactive and sold out — means
 * nothing at all, and neither label says what the customer ends up seeing. As
 * one question with three answers there is nothing to get wrong.
 *
 * out_of_stock is deliberately not one of the answers: the inventory engine
 * owns it, a value set by hand here would be overwritten by the next stock
 * movement, and the editor says so beside the control instead.
 */

export const AVAILABILITY = {
  live: 'live',
  soldOut: 'soldOut',
  hidden: 'hidden',
}

/** Which of the three an item is in right now. */
export function availabilityOf(item) {
  if (!item.isActive) return AVAILABILITY.hidden
  return item.isSoldOut ? AVAILABILITY.soldOut : AVAILABILITY.live
}

/**
 * The two columns for a chosen answer.
 *
 * Hiding clears the sold-out flag rather than preserving it, so the three
 * states stay genuinely exclusive — an item put back on the menu comes back
 * orderable, which is what "put it back" means.
 */
export function applyAvailability(item, availability) {
  if (availability === AVAILABILITY.hidden) {
    return { ...item, isActive: false, isSoldOut: false }
  }

  return {
    ...item,
    isActive: true,
    isSoldOut: availability === AVAILABILITY.soldOut,
  }
}

/**
 * What the item is doing right now, all things considered — including the one
 * state the Admin does not choose.
 *
 * Ordered by what overrules what: hidden beats everything because a hidden item
 * is not on the menu to be sold out of, and the engine's out_of_stock beats a
 * hand-set sold-out because it is the one the customer will actually hit.
 */
export const MENU_STATUS = {
  live: 'live',
  soldOut: 'soldOut',
  hidden: 'hidden',
  outOfStock: 'outOfStock',
}

export function statusOf(item) {
  if (!item.isActive) return MENU_STATUS.hidden
  if (item.outOfStock) return MENU_STATUS.outOfStock
  if (item.isSoldOut) return MENU_STATUS.soldOut
  return MENU_STATUS.live
}
