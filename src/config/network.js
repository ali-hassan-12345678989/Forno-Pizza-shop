/**
 * How long the first paint waits on the database before it gives up and says so.
 *
 * Nothing renders until shop_settings arrives — that is deliberate, and the
 * reason is in SettingsContext. The cost is that when Supabase is unreachable
 * the customer watches an indistinguishable "Loading…" while supabase-js works
 * through its own retries; measured with the network blocked, the error took
 * between five and eight seconds to appear. On a bad connection that is exactly
 * where someone gives up and phones instead.
 *
 * Four seconds is long enough that a slow-but-working connection still loads
 * normally, and short enough that a broken one says so while the customer is
 * still watching. The error screen offers a retry, so a timeout is not a dead
 * end — it is the difference between "this is broken, here is a button" and a
 * spinner that explains nothing.
 */
export const SETTINGS_TIMEOUT_MS = 4000
