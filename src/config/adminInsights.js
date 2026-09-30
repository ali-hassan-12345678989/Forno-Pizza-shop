/**
 * The Admin panel's costing and timing reports.
 *
 * These mirror the guards in supabase/admin_insights.sql. A browser cannot read
 * a Postgres constant, so the duplication is unavoidable — what is avoidable is
 * it drifting unnoticed, which is what tests/admin-insights.test.js is for: it
 * probes the real database with these exact values.
 */

/** Matches c_max_days in admin_cogs(), admin_product_mix() and admin_fulfillment_times(). */
export const MAX_ADMIN_DAYS = 366

/**
 * How far back each report looks.
 *
 * A month for both. A product mix needs enough sales for a median to mean
 * anything, and fulfilment timings need enough orders that one bad night does
 * not become the headline.
 */
export const MIX_DAYS = 30
export const TIMING_DAYS = 30

/** Matches c_max_cost in admin_set_ingredient_cost(). Above this is a typo. */
export const MAX_INGREDIENT_COST = 1000000

/** Matches c_max_target in admin_set_sales_target(). */
export const MAX_SALES_TARGET = 100000000

/** Matches c_max_quantity in admin_save_recipe_line(). */
export const MAX_RECIPE_QUANTITY = 100000

/**
 * Weekday order for the targets editor: Monday first.
 *
 * The database keys on extract(dow), where 0 is Sunday, so the numbers are not
 * in the order anybody reads a week in. Rotating here rather than in the
 * database keeps the stored key matching Postgres's own convention — which is
 * what lets a target be joined to a sales row without translating anything.
 */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export function isValidCost(value) {
  if (String(value ?? '').trim() === '') return false
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 && n <= MAX_INGREDIENT_COST
}

export function isValidTarget(value) {
  if (String(value ?? '').trim() === '') return false
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 && n <= MAX_SALES_TARGET
}

export function isValidRecipeQuantity(value) {
  if (String(value ?? '').trim() === '') return false
  const n = Number(value)
  return Number.isFinite(n) && n > 0 && n <= MAX_RECIPE_QUANTITY
}
