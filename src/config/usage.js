/**
 * Ingredient usage.
 *
 * Mirrors staff_usage_between() and the reason vocabulary in
 * supabase/stock_movements.sql. A browser cannot read a Postgres check
 * constraint, so the duplication is unavoidable — what is avoidable is it
 * drifting unnoticed. tests/ingredient-usage.test.js probes the real database
 * with these exact values.
 */

/**
 * Why a movement happened. Must match the check on stock_movements.reason.
 *
 * `count` is the fourth, added by manager_insights.sql when physical counting
 * went in. It matters here because usage means orders only: a shelf found 2 kg
 * short is a discrepancy, not 2 kg of cooking, and folding one into the other
 * would report a theft as a busy night.
 */
export const MOVEMENT_REASONS = {
  order: 'order',
  cancel: 'cancel',
  receive: 'receive',
  count: 'count',
}

/**
 * Days are cut in the shop's own time zone, server-side. Held here only so the
 * screen can say so out loud — nothing in the browser does the bucketing.
 * Same value as SHOP_TIME_ZONE in config/reports.js, and as c_shop_tz in both
 * staff_usage_between() and sales_report().
 */
export { SHOP_TIME_ZONE } from './reports'
