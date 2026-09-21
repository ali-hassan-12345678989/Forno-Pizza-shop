import { supabase } from '../supabaseClient'
import { MAX_REPORT_PERIODS, REPORT_WINDOW, isReportPeriod } from '../config/reports'

const REPORT_ERRORS = {
  not_staff: 'not_staff',
  invalid_period: 'invalid_period',
  invalid_limit: 'invalid_limit',
}

function errorCodeFrom(error) {
  const raw = String(error?.message ?? '').trim()
  return REPORT_ERRORS[raw] ?? 'unknown'
}

/**
 * Orders and revenue, grouped (FR-6.4, FR-7.4).
 *
 * Every figure is computed in Postgres — including which orders count as
 * sales and where each day begins. The browser only draws them. Summing
 * totals here from raw order rows would need those rows shipped to the client
 * in the first place, which is exactly what the orders table does not allow.
 */
export async function fetchSalesReport(period, limit = REPORT_WINDOW[period]) {
  if (!isReportPeriod(period)) return { rows: null, errorCode: 'invalid_period' }

  const { data, error } = await supabase.rpc('sales_report', {
    p_period: period,
    p_limit: Math.min(limit ?? MAX_REPORT_PERIODS, MAX_REPORT_PERIODS),
  })

  if (error) return { rows: null, errorCode: errorCodeFrom(error) }

  return {
    rows: (data ?? []).map((row) => ({
      periodStart: row.period_start,
      orders: Number(row.order_count),
      revenue: Number(row.revenue),
      goodsRevenue: Number(row.goods_revenue),
      cancelled: Number(row.cancelled_count),
    })),
    errorCode: null,
  }
}
