/**
 * The review contract.
 *
 * Every number here is stated twice: once in this file, and once in
 * submit_review() in supabase/reviews.sql — plus the `rating between 1 and 5`
 * check constraint that schema.sql puts on the column itself. That duplication
 * is unavoidable, for the same reason the checkout limits in lib/validation.js
 * are duplicated: a browser cannot read a Postgres constant and Postgres cannot
 * import a module.
 *
 * What is avoidable is the two drifting apart without anybody noticing, so
 * tests/reviews.test.js probes the database at each boundary using the values
 * below. Change one of these numbers without changing the SQL and the suite
 * fails, which is the whole point of writing them down here rather than
 * inline at the three places that happen to need them.
 */

export const MIN_RATING = 1
export const MAX_RATING = 5

/** The stars themselves, so nothing has to write out [1, 2, 3, 4, 5]. */
export const RATING_SCALE = Array.from(
  { length: MAX_RATING - MIN_RATING + 1 },
  (_, i) => MIN_RATING + i,
)

/** Matches `char_length(v_comment) > 500` in submit_review(). */
export const MAX_COMMENT_LENGTH = 500

/**
 * How many reviews a dish shows at once. Mirrors the default on
 * item_reviews(p_limit int default 20), which also caps it at 50 server-side —
 * a client asking for more does not get more.
 */
export const REVIEWS_PER_ITEM = 20

/** Rows the comment box opens at. Presentational; it grows as they type. */
export const COMMENT_ROWS = 2
