/**
 * The one place order money is worked out, so the cart, checkout and
 * confirmation can never disagree with each other.
 *
 * deliveryFee is passed in rather than imported: it lives in the shop_settings
 * table, so the shop owner can change it without a redeploy.
 *
 * Prices are tax-inclusive (Cheezious does the same, and it avoids Pizza Hut
 * PK's confusing "GST ( %)" line), so there is no separate tax row.
 *
 * NOTE: this is display maths. Part 2's engineering standards require the order
 * total to be recomputed server-side on submit — a browser-sent price is never
 * trusted. Task 6 adds that as a Postgres function reading the same settings row.
 */
export function calculateTotals({ subtotal, isDelivery, deliveryFee = 0 }) {
  const fee = isDelivery ? Number(deliveryFee) : 0

  return {
    subtotal,
    deliveryFee: fee,
    total: subtotal + fee,
  }
}
