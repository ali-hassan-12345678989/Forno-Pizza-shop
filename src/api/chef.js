import { supabase } from '../supabaseClient'

/** Codes the kitchen functions can raise. */
const CHEF_ERRORS = {
  not_kitchen: 'not_kitchen',
  order_not_found: 'order_not_found',
  order_cancelled: 'order_cancelled',
  invalid_status: 'invalid_status',
  status_not_forward: 'status_not_forward',
  already_final: 'already_final',
}

function errorCodeFrom(error) {
  const raw = String(error?.message ?? '').trim()
  return CHEF_ERRORS[raw] ?? 'unknown'
}

/**
 * Open orders for the kitchen, oldest first.
 *
 * `nextStatus` comes from the database, computed from each order's own ladder,
 * so the button can never offer a step Postgres would refuse — a pickup order
 * is never "out for delivery". Working it out in the browser would be a second
 * opinion about a sequence the database already owns and enforces.
 *
 * There is no phone number or address in this payload. A kitchen screen sits
 * on a counter all evening; it needs to know what to cook, not where anyone
 * lives.
 */
export async function fetchChefOrders() {
  const { data, error } = await supabase.rpc('chef_orders')

  if (error) return { orders: null, errorCode: errorCodeFrom(error) }

  return {
    orders: (data ?? []).map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      status: row.status,
      fulfillmentType: row.fulfillment_type,
      customerName: row.customer_name,
      placedAt: row.created_at,
      itemCount: Number(row.item_count),
      items: (row.items ?? []).map((item) => ({
        name: item.name,
        size: item.size,
        quantity: Number(item.quantity),
        toppings: (item.toppings ?? []).map((topping) => topping.name),
      })),
      nextStatus: row.next_status,
    })),
    errorCode: null,
  }
}

/**
 * Moves one order to its next stage.
 *
 * The target is sent explicitly rather than calling advance_order_status(),
 * which recomputes "next" from whatever the row says at that instant. Sending
 * the stage the chef actually saw means that if someone else moved the order in
 * the ten seconds since this screen last refreshed, the database refuses with
 * status_not_forward instead of quietly skipping a stage nobody intended.
 */
export async function advanceOrder(orderId, nextStatus) {
  const { data, error } = await supabase.rpc('set_order_status', {
    p_order_id: orderId,
    p_status: nextStatus,
  })

  if (error) return { result: null, errorCode: errorCodeFrom(error) }

  return {
    result: { orderNumber: data.order_number, status: data.status },
    errorCode: null,
  }
}
