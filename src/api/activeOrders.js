import { supabase } from '../supabaseClient'

const ACTIVE_ERRORS = { not_staff: 'not_staff' }

function errorCodeFrom(error) {
  const raw = String(error?.message ?? '').trim()
  return ACTIVE_ERRORS[raw] ?? 'unknown'
}

/**
 * Orders still in progress (FR-7.3).
 *
 * What counts as "in progress" is decided by order_is_active(), which reads
 * the terminal status off the end of order_status_flow(). The browser does
 * not hold its own list of finished statuses — one that drifted would quietly
 * under- or over-report how busy the shop is.
 */
export async function fetchActiveOrders() {
  const { data, error } = await supabase.rpc('admin_active_orders')

  if (error) return { groups: null, errorCode: errorCodeFrom(error) }

  return {
    groups: (data ?? []).map((row) => ({
      status: row.status,
      fulfillmentType: row.fulfillment_type,
      count: Number(row.order_count),
      oldestAt: row.oldest_at,
    })),
    errorCode: null,
  }
}
