import { supabase } from '../supabaseClient'
import { CANCELLED_DAYS, DAYPART_DAYS, TOP_ITEMS_DAYS } from '../config/insights'

/** Codes the insight functions can raise, mapped for the UI. */
const INSIGHT_ERRORS = {
  not_staff: 'not_staff',
  invalid_range: 'invalid_range',
  range_too_long: 'range_too_long',
}

function errorCodeFrom(error) {
  const raw = String(error?.message ?? '').trim()
  return INSIGHT_ERRORS[raw] ?? 'unknown'
}

/**
 * What has actually been selling.
 *
 * Grouped, ranked and windowed by staff_top_items(); nothing here re-sorts it.
 * Cancelled orders are already excluded server-side, which is what lets this
 * panel and the usage screen beside it describe the same trade.
 */
export async function fetchTopItems(days = TOP_ITEMS_DAYS) {
  const { data, error } = await supabase.rpc('staff_top_items', { p_days: days })

  if (error) return { rows: null, errorCode: errorCodeFrom(error) }

  return {
    rows: (data ?? []).map((row) => ({
      id: row.menu_item_id,
      name: row.item_name,
      quantity: Number(row.qty_sold),
      revenue: Number(row.revenue),
    })),
    errorCode: null,
  }
}

/**
 * The cancellations behind the summary figure.
 *
 * Rows rather than a pre-grouped count, because "how many" is already on the
 * screen and the question this answers is "which ones". The grouping by reason
 * happens in lib/cancellations.js over these same rows, so the list and the
 * breakdown can never describe different sets of orders.
 */
export async function fetchCancelledOrders(days = CANCELLED_DAYS) {
  const { data, error } = await supabase.rpc('staff_cancelled_orders', { p_days: days })

  if (error) return { rows: null, errorCode: errorCodeFrom(error) }

  return {
    rows: (data ?? []).map((row) => ({
      orderNumber: row.order_number,
      customerName: row.customer_name,
      fulfillmentType: row.fulfillment_type,
      total: Number(row.total),
      // Null is a real answer here — an order cancelled before the reason
      // existed, or by somebody who declined to say. The screen prints it as
      // "not given" rather than guessing.
      reason: row.cancelled_reason,
      createdAt: row.created_at,
    })),
    errorCode: null,
  }
}

/**
 * When the shop is busy, for writing a rota against.
 *
 * The bucket names and their order come from the database, so the browser
 * never holds a second copy of a vocabulary that could drift from the one
 * doing the actual grouping. A quiet part of the day comes back at zero rather
 * than missing — "nobody orders then" and "no data" are different answers.
 */
export async function fetchDayparts(days = DAYPART_DAYS) {
  const { data, error } = await supabase.rpc('sales_by_daypart', { p_days: days })

  if (error) return { rows: null, errorCode: errorCodeFrom(error) }

  return {
    rows: (data ?? []).map((row) => ({
      name: row.daypart,
      order: Number(row.sort_order),
      startsHour: Number(row.starts_hour),
      endsHour: Number(row.ends_hour),
      orders: Number(row.order_count),
      revenue: Number(row.revenue),
    })),
    errorCode: null,
  }
}
