/**
 * The Admin orders list.
 *
 * Mirrors admin_orders() in supabase/admin_orders.sql. A browser cannot read a
 * Postgres constant, so the duplication is unavoidable — what is avoidable is
 * it drifting unnoticed. tests/admin-orders.test.js probes the real database
 * with these exact values.
 */

/**
 * How many orders the list asks for.
 *
 * A list is for scanning, not for archaeology. A shop doing fifty orders a day
 * fills this in two days, and anything older is a reporting question that
 * sales_report() already answers.
 */
export const ADMIN_ORDERS_LIMIT = 100

/** Matches c_max_limit in admin_orders(); anything above it is refused. */
export const MAX_ADMIN_ORDERS = 500
