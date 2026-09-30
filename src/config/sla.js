/**
 * When an order counts as late.
 *
 * THE DEADLINE ITSELF IS NOT HERE. It comes from `delivery_eta` and
 * `pickup_eta` in shop_settings — the words printed on the menu — so that an
 * order is late exactly when it has passed what the customer was told. Putting
 * a number here instead would be a second promise, kept in a file nobody reads,
 * quietly disagreeing with the one on the website.
 *
 * What IS here is the two things the promise cannot supply.
 */

/**
 * Used only when the promise cannot be read as a number at all — if somebody
 * writes "as soon as we can" into the ETA field, an order still has to be
 * judged against something. The screen says the deadline is assumed when this
 * applies, rather than presenting a guess as the shop's word.
 */
export const FALLBACK_SLA_MINUTES = {
  delivery: 45,
  pickup: 20,
}

/**
 * How far into its window an order has to be before it is worth watching.
 *
 * Eight tenths. Early enough that somebody can still do something about it —
 * chase the kitchen, start the drive — and late enough that the board is not
 * amber all day, which would make amber mean nothing.
 */
export const SLA_WARN_AT = 0.8
