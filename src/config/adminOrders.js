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

/**
 * How long to wait after a keystroke before asking the database.
 *
 * The search travels now — admin_orders() matches the phone number server-side
 * so it never reaches the browser — and a request per keystroke would be a
 * dozen round trips to type a phone number. A third of a second is long enough
 * to gather a burst of typing and short enough that a pause feels like an
 * answer rather than a wait.
 */
export const SEARCH_DEBOUNCE_MS = 300
