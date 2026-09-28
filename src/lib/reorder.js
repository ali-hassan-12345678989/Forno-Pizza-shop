/**
 * Turns a past order back into a cart.
 *
 * THE RULE THIS IS BUILT ON: a past order is a record of what was bought, not
 * a shopping list that still works. Between then and now a price can have
 * changed, a size can have been withdrawn, a topping can have been dropped and
 * a whole dish can have left the menu. So nothing here is copied forward —
 * every line is looked up again in today's menu, and what comes back is
 * today's dish at today's price.
 *
 * Copying the old prices across would be the easy version and it would be
 * wrong in the worst way: quietly, and in the shop's favour or the customer's,
 * depending on which way the price moved. place_order() recomputes every total
 * server-side and would reject or re-price it anyway, so the only thing a
 * stale copy could achieve is showing the customer a number the kitchen
 * disagrees with.
 *
 * Pure, and takes the menu as an argument, so the interesting cases — a
 * withdrawn size, a sold-out dish, a topping that no longer exists — are
 * ordinary tests rather than something that needs a database in a certain
 * state.
 */

/**
 * @param order  a row from fetchMyOrders()
 * @param menu   today's menu, from fetchMenu()
 * @returns {{ lines: Array, unavailable: string[], droppedToppings: string[] }}
 *
 * `lines` are ready to hand to cart.addLine(). `unavailable` names what could
 * not come back, so the customer is told rather than left to notice a shorter
 * cart. `droppedToppings` is separate because losing an extra is not the same
 * as losing the dish — the pizza still arrives, without the olives.
 */
export function buildReorderPlan(order, menu) {
  const byId = new Map((menu ?? []).map((item) => [item.id, item]))
  const lines = []
  const unavailable = []
  const droppedToppings = []

  for (const past of order?.items ?? []) {
    const item = byId.get(past.menuItemId)

    // Gone from the menu, or pulled from sale. Either way it cannot be bought
    // today, and the sold-out flag already folds in both the shop's own
    // decision and the stock engine's reading.
    if (!item || item.isSoldOut) {
      unavailable.push(past.name)
      continue
    }

    // Matched on the label rather than an id, because the line kept "Large"
    // and not the size row it came from. Labels are unique within an item —
    // there is no second Large — so this is exact, not a guess.
    const size = item.sizes?.find((candidate) => candidate.label === past.sizeLabel)

    if (!size) {
      // The dish is still sold, just not in that size. Naming both halves is
      // what makes the message useful: "Chicken Tikka (Large)" tells them what
      // to go and choose instead.
      unavailable.push(`${item.name} (${past.sizeLabel})`)
      continue
    }

    const toppings = []
    for (const pastTopping of past.toppings ?? []) {
      const topping = item.toppings?.find((candidate) => candidate.id === pastTopping.id)
      if (topping) toppings.push(topping)
      else droppedToppings.push(pastTopping.name)
    }

    lines.push({ item, size, toppings, quantity: past.quantity })
  }

  return {
    lines,
    // Deduplicated: an order with three lines of a withdrawn item should say
    // its name once, not three times.
    unavailable: [...new Set(unavailable)],
    droppedToppings: [...new Set(droppedToppings)],
  }
}

/** Could any of this order be bought again? */
export function canReorder(order, menu) {
  return buildReorderPlan(order, menu).lines.length > 0
}
