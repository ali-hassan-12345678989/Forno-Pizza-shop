import { ORDER_TYPES } from './fulfillment'

/**
 * The order lifecycle.
 *
 * These exact strings are the `status` check constraint in supabase/schema.sql,
 * so they are a contract with the database, not a display choice — the words a
 * customer actually reads live in content/copy.js. tests/order-status.test.js
 * proves this list and the constraint still agree.
 */
export const ORDER_STATUS = {
  placed: 'placed',
  preparing: 'preparing',
  outForDelivery: 'out_for_delivery',
  readyForPickup: 'ready_for_pickup',
  delivered: 'delivered',
  pickedUp: 'picked_up',
  cancelled: 'cancelled',
}

/**
 * The four stages an order moves through, in order.
 *
 * Delivery and pickup share the first two and diverge after: an order the
 * customer is collecting is never "out for delivery". Mirrored by
 * public.order_status_flow() in supabase/order_status.sql, which is what
 * actually enforces the sequence.
 */
export const STATUS_FLOW = {
  [ORDER_TYPES.delivery]: [
    ORDER_STATUS.placed,
    ORDER_STATUS.preparing,
    ORDER_STATUS.outForDelivery,
    ORDER_STATUS.delivered,
  ],
  [ORDER_TYPES.pickup]: [
    ORDER_STATUS.placed,
    ORDER_STATUS.preparing,
    ORDER_STATUS.readyForPickup,
    ORDER_STATUS.pickedUp,
  ],
}

/** The ladder this order is on. Falls back to delivery for an unknown type. */
export function stagesFor(fulfillmentType) {
  return STATUS_FLOW[fulfillmentType] ?? STATUS_FLOW[ORDER_TYPES.delivery]
}

/** How far along the ladder a status sits, or -1 if it is not on this one. */
export function stageIndexOf(status, fulfillmentType) {
  return stagesFor(fulfillmentType).indexOf(status)
}

export function isCancelled(status) {
  return status === ORDER_STATUS.cancelled
}

/* Derived from the flows rather than listed again, so adding a fulfillment type
   cannot leave a stale copy of "the last one" behind. */
const FINAL_STATUSES = new Set([
  ...Object.values(STATUS_FLOW).map((stages) => stages[stages.length - 1]),
  ORDER_STATUS.cancelled,
])

/** Nothing further will happen to this order, so the tracker can stop asking. */
export function isFinal(status) {
  return FINAL_STATUSES.has(status)
}

/**
 * How a single stage of the trail reads, as opposed to what the ORDER's status
 * is. Four presentation states, not seven order statuses.
 *
 * Named because they cross a module boundary: stageStateOf() below produces
 * them and OrderStatusTrail turns them into class names and into the words a
 * screen reader hears. Spelled out as literals at both ends, a typo in either
 * would silently render an unstyled, unlabelled step.
 */
export const TRAIL_STATE = {
  done: 'done',
  current: 'current',
  pending: 'pending',
  cancelled: 'cancelled',
}

/**
 * How one stage of the ladder should read on the tracking page.
 *
 * Three rules, and the third is the one that is easy to get wrong:
 *
 *  - A cancelled order stops where it stopped. Whatever it had already reached
 *    stays ticked and nothing ahead of it is "coming" any more, because it is
 *    not. Answered from the history, since 'cancelled' is not on the ladder.
 *  - The stage an order is sitting on is the one in progress.
 *  - Except at the end. "Delivered" is not something still happening — an order
 *    at its final stage has that stage finished, not underway.
 *
 * @param {number}  index             position of the stage being drawn
 * @param {number}  reached           position the order has got to, -1 if off-ladder
 * @param {string}  status            the order's current status
 * @param {boolean} reachedInHistory  whether this stage was ever recorded
 */
export function stageStateOf({ index, reached, status, reachedInHistory }) {
  if (isCancelled(status)) {
    return reachedInHistory ? TRAIL_STATE.done : TRAIL_STATE.pending
  }
  if (index < reached) return TRAIL_STATE.done
  if (index === reached) {
    return isFinal(status) ? TRAIL_STATE.done : TRAIL_STATE.current
  }
  return TRAIL_STATE.pending
}

/**
 * How often an open tracking page re-checks a live order.
 *
 * Slow on purpose. A kitchen moves an order every few minutes, not every few
 * seconds, and the page also refreshes the moment the tab is looked at again —
 * which is when a customer actually wants to know.
 */
export const STATUS_POLL_MS = 20_000
