/**
 * How an order reaches the customer. These exact strings are the
 * `fulfillment_type` check constraint in supabase/schema.sql, so they are a
 * contract with the database, not a display choice — the labels customers read
 * live in content/copy.js.
 *
 * Kept in config/ rather than beside the React context that happens to hold the
 * current value, so api/ and lib/ can use it without importing a provider.
 */
export const ORDER_TYPES = {
  delivery: 'delivery',
  pickup: 'pickup',
}
