/**
 * Limits on booking in stock.
 *
 * These mirror receive_stock() in supabase/receive_stock.sql. A browser cannot
 * read a Postgres constant, so the duplication is unavoidable — what is
 * avoidable is it drifting unnoticed. tests/receive-stock.test.js probes the
 * real database at each boundary using these exact values, so changing one end
 * without the other fails the suite rather than production.
 */

/** Anything at or below this is not a delivery. */
export const MIN_STOCK_RECEIPT = 0

/** Matches c_max_receipt in receive_stock(). Above this is a typo, not a delivery. */
export const MAX_STOCK_RECEIPT = 1000000

/**
 * Quantities are numeric(12,3) in Postgres, so three decimals is exactly what
 * the column can hold — offering more would invite silent rounding.
 */
export const STOCK_DECIMALS = 3

export function isValidReceipt(quantity) {
  const n = Number(quantity)
  return Number.isFinite(n) && n > MIN_STOCK_RECEIPT && n <= MAX_STOCK_RECEIPT
}
