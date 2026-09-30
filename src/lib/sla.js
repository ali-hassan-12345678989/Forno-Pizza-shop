import { FALLBACK_SLA_MINUTES, SLA_WARN_AT } from '../config/sla'

/**
 * Which orders are running late.
 *
 * THE DEADLINE IS THE SHOP'S OWN PROMISE. `delivery_eta` and `pickup_eta` in
 * shop_settings are the words printed on the menu — "25–35 min", "15 min" — so
 * an order is late exactly when it has passed what the customer was told, and
 * not when it passes a number invented in here. Change the promise on the menu
 * and this moves with it, which is the only way the two can stay honest.
 *
 * The cost of reading a promise out of free text is that the text can say
 * anything. So it is parsed carefully, and when it cannot be read at all the
 * fallback in config/sla.js applies and the screen says the deadline is an
 * assumption rather than the shop's word.
 *
 * Pure, so the rules are testable without a browser or a database.
 */

/** The three states an in-flight order can be in. */
export const SLA_STATES = { ok: 'ok', due: 'due', late: 'late' }

/**
 * The minutes a promise allows, from text like "25–35 min" or "15 min".
 *
 * THE UPPER BOUND, always. "25–35 min" promises thirty-five; treating it as
 * twenty-five would flag as late every order that arrived inside the window the
 * customer was actually given, and a board that cries wolf gets ignored.
 *
 * Returns null rather than guessing when there is no number to read, so the
 * caller can say the deadline is assumed.
 */
export function promisedMinutes(etaText) {
  const numbers = String(etaText ?? '').match(/\d+/g)
  if (!numbers || numbers.length === 0) return null

  const highest = Math.max(...numbers.map(Number))
  return Number.isFinite(highest) && highest > 0 ? highest : null
}

/**
 * How one in-flight order is doing against its promise.
 *
 * Only orders still in play are judged. A delivered order took what it took,
 * and a board reporting yesterday's finished orders as "late" is a board
 * nobody can act on — this exists to dispatch somebody, not to keep score.
 * Cancelled orders are likewise nobody's deadline.
 */
export function slaFor(order, { settings, now = Date.now() } = {}) {
  if (!order || !order.isActive) return null

  // `placedAt` is what fetchAdminOrders() calls it. Named for when the order
  // was placed rather than when the row was written, because they are the same
  // moment here and the first is what a person means.
  const placed = Date.parse(order.placedAt)
  if (Number.isNaN(placed)) return null

  const isDelivery = order.fulfillmentType === 'delivery'
  const promised = promisedMinutes(isDelivery ? settings?.deliveryEta : settings?.pickupEta)
  const assumed = promised === null

  const limit =
    promised ?? (isDelivery ? FALLBACK_SLA_MINUTES.delivery : FALLBACK_SLA_MINUTES.pickup)
  const elapsedMinutes = (now - placed) / 60000
  const ratio = elapsedMinutes / limit

  return {
    elapsedMinutes,
    limitMinutes: limit,
    overdueMinutes: Math.max(0, elapsedMinutes - limit),
    assumed,
    state: ratio >= 1 ? SLA_STATES.late : ratio >= SLA_WARN_AT ? SLA_STATES.due : SLA_STATES.ok,
  }
}

/**
 * Every order past its promise, worst first.
 *
 * Sorted by how far over it is rather than by when it was placed: the order
 * that has been waiting longest relative to what it was promised is the one to
 * ring about, and a pickup twenty minutes late is a bigger failure than a
 * delivery twenty minutes into a thirty-five minute window.
 */
export function lateOrders(orders, opts) {
  return (orders ?? [])
    .map((order) => ({ order, sla: slaFor(order, opts) }))
    .filter((row) => row.sla?.state === SLA_STATES.late)
    .sort((a, b) => b.sla.overdueMinutes - a.sla.overdueMinutes)
}

/** Orders inside their window but close to the edge, for the amber count. */
export function dueOrders(orders, opts) {
  return (orders ?? [])
    .map((order) => ({ order, sla: slaFor(order, opts) }))
    .filter((row) => row.sla?.state === SLA_STATES.due)
    .sort((a, b) => b.sla.elapsedMinutes - a.sla.elapsedMinutes)
}
