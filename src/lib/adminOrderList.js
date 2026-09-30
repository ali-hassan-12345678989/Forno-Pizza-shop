import { ORDER_STATUS } from '../config/orderStatus'
import { SLA_STATES, slaFor } from './sla'

/**
 * Filtering the Admin's order list.
 *
 * Pure, so the rules are testable without a browser or a database. What is
 * deliberately NOT here is any opinion about which statuses count as finished:
 * admin_orders() sends `isActive` per row, computed by order_is_active(), which
 * reads the terminal status off the end of order_status_flow(). A second list
 * of final statuses maintained in JavaScript is exactly the kind of thing that
 * drifts and then quietly mis-sorts every order on the screen.
 */

/**
 * The buckets a row can sit in. Every order is in exactly one.
 *
 * These are this module's own vocabulary — the names of the filter chips — and
 * not order statuses. ORDER_VIEWS.cancelled and ORDER_STATUS.cancelled happen
 * to spell the same word, which is a coincidence and not a link: `active` and
 * `completed` are each several statuses, and the ladder can gain a status
 * without gaining a chip. Never pass a status where a view is wanted.
 */
export const ORDER_VIEWS = {
  all: 'all',
  active: 'active',
  /* NOT a bucket, and deliberately not in bucketOf(). A late order is still an
     active order — it appears under both chips, because it is genuinely both,
     and moving it out of "in progress" would make that list quietly incomplete
     at exactly the moment somebody is counting what is still out. */
  delayed: 'delayed',
  completed: 'completed',
  cancelled: 'cancelled',
}

export const ALL_ORDER_VIEWS = Object.values(ORDER_VIEWS)

/**
 * Which bucket one order belongs to.
 *
 * Cancelled is checked first and on its own: a cancelled order is not active,
 * but calling it "completed" would file a refund next to a delivery.
 */
export function bucketOf(order) {
  if (order.status === ORDER_STATUS.cancelled) return ORDER_VIEWS.cancelled
  return order.isActive ? ORDER_VIEWS.active : ORDER_VIEWS.completed
}

export function matchesView(order, view, sla = {}) {
  if (view === ORDER_VIEWS.all) return true
  if (view === ORDER_VIEWS.delayed) return slaFor(order, sla)?.state === SLA_STATES.late
  return bucketOf(order) === view
}

/**
 * Order number or customer name.
 *
 * Those are the two things a person has in front of them — a number read off a
 * ticket or a name from a phone call. Searching the delivery address as well
 * would turn "F-7" into forty matches.
 *
 * THE PHONE NUMBER IS NOT MATCHED HERE, and cannot be: it is never sent to the
 * browser. admin_orders() matches it server-side, so this narrows what already
 * came back and the database does the part that needs data this list does not
 * hold. Both run, and neither is redundant — this one is instant while the
 * other is a round trip.
 */
export function matchesQuery(order, query) {
  const needle = String(query ?? '')
    .trim()
    .toLowerCase()
  if (!needle) return true

  return `${order.orderNumber} ${order.customerName}`.toLowerCase().includes(needle)
}

export function filterOrders(orders, { view = ORDER_VIEWS.all, query = '', sla = {} } = {}) {
  return (orders ?? []).filter(
    (order) => matchesView(order, view, sla) && matchesQuery(order, query),
  )
}

/**
 * How many orders sit in each bucket, for the filter chips.
 *
 * Counted from the whole list rather than the filtered one, so the chips keep
 * saying how much is behind them while a search is narrowing what is shown.
 */
export function countsByView(orders, sla = {}) {
  const counts = Object.fromEntries(ALL_ORDER_VIEWS.map((view) => [view, 0]))
  counts[ORDER_VIEWS.all] = (orders ?? []).length

  for (const order of orders ?? []) {
    counts[bucketOf(order)] += 1
    // Counted separately, and on top: a late order has already been counted as
    // active above. See the note on ORDER_VIEWS.delayed.
    if (slaFor(order, sla)?.state === SLA_STATES.late) counts[ORDER_VIEWS.delayed] += 1
  }

  return counts
}
