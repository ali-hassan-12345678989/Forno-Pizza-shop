import { supabase } from '../supabaseClient'
import { normaliseOrder } from './orders'
import { ADMIN_ORDERS_LIMIT } from '../config/adminOrders'

/** Codes admin_orders() and admin_order_detail() can raise. */
const ADMIN_ORDER_ERRORS = {
  not_admin: 'not_admin',
  invalid_limit: 'invalid_limit',
  order_not_found: 'order_not_found',
}

function errorCodeFrom(error) {
  const raw = String(error?.message ?? '').trim()
  return ADMIN_ORDER_ERRORS[raw] ?? 'unknown'
}

/**
 * Recent orders for the Admin panel, newest first.
 *
 * `isActive` comes from the database rather than being worked out here — see
 * order_is_active(), which reads the terminal status off the end of the status
 * ladder. The browser holding its own list of finished statuses is how a screen
 * ends up disagreeing with the badge in its own sidebar.
 *
 * No phone number or address is in this payload. The list does not show them,
 * so it does not ask for them; admin_order_detail() is the only reader that
 * hands over contact details.
 */
export async function fetchAdminOrders(limit = ADMIN_ORDERS_LIMIT) {
  const { data, error } = await supabase.rpc('admin_orders', { p_limit: limit })

  if (error) return { orders: null, errorCode: errorCodeFrom(error) }

  return {
    orders: (data ?? []).map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      status: row.status,
      fulfillmentType: row.fulfillment_type,
      customerName: row.customer_name,
      hasAccount: row.has_account,
      itemCount: Number(row.item_count),
      total: Number(row.total),
      placedAt: row.created_at,
      isActive: row.is_active,
    })),
    errorCode: null,
  }
}

/**
 * One order in full: lines, extras, status trail, and the account behind it.
 *
 * The payload is the same order/items/status_history shape get_order_by_token()
 * returns, so normaliseOrder() maps it — `account` is the only addition, and it
 * is null for a guest.
 *
 * Every order carries a name and a phone because checkout requires them of
 * guests too; that is how the food arrives. What is genuinely optional is the
 * account, which is why it is the part that can be null.
 */
export async function fetchAdminOrderDetail(orderId) {
  const { data, error } = await supabase.rpc('admin_order_detail', { p_order_id: orderId })

  if (error) return { order: null, errorCode: errorCodeFrom(error) }
  if (!data) return { order: null, errorCode: 'order_not_found' }

  return {
    order: {
      ...normaliseOrder(data),
      account: data.account
        ? {
            email: data.account.email,
            orderCount: Number(data.account.order_count),
          }
        : null,
    },
    errorCode: null,
  }
}
