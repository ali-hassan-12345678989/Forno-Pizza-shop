/**
 * Ingredient usage.
 *
 * Mirrors staff_ingredient_usage() and the reason vocabulary in
 * supabase/stock_movements.sql. A browser cannot read a Postgres check
 * constraint, so the duplication is unavoidable — what is avoidable is it
 * drifting unnoticed. tests/ingredient-usage.test.js probes the real database
 * with these exact values.
 */

/** Why a movement happened. Must match the check on stock_movements.reason. */
export const MOVEMENT_REASONS = {
  order: 'order',
  cancel: 'cancel',
  receive: 'receive',
}

/**
 * The two windows the screen offers.
 *
 * Both come back on the same row from one call, so switching between them
 * costs nothing and cannot show two moments' data side by side.
 */
export const USAGE_PERIODS = {
  today: 'today',
  total: 'total',
}

export const ALL_USAGE_PERIODS = Object.values(USAGE_PERIODS)

export const DEFAULT_USAGE_PERIOD = USAGE_PERIODS.today

/**
 * Days are cut in the shop's own time zone, server-side. Held here only so the
 * screen can say so out loud — nothing in the browser does the bucketing.
 * Same value as SHOP_TIME_ZONE in config/reports.js, and as c_shop_tz in both
 * staff_ingredient_usage() and sales_report().
 */
export { SHOP_TIME_ZONE } from './reports'
