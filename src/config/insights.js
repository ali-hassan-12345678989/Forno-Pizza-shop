/**
 * The Manager panel's newer questions.
 *
 * These mirror the guards in supabase/manager_insights.sql. A browser cannot
 * read a Postgres constant, so the duplication is unavoidable — what is
 * avoidable is it drifting unnoticed, which is what tests/manager-insights.test.js
 * is for: it probes the real database with these exact values.
 */

/** Matches c_max_days in staff_top_items(), staff_cancelled_orders(),
 *  sales_by_daypart() and staff_usage_between(). */
export const MAX_INSIGHT_DAYS = 366

/**
 * How far back each panel looks.
 *
 * A week for top sellers, because the question it answers is "what should the
 * kitchen be prepped for tomorrow" and a month-old favourite is not that.
 * A month for the other two: cancellations and day-parts are patterns, and a
 * pattern needs more than seven points before it is worth acting on.
 */
export const TOP_ITEMS_DAYS = 7
export const CANCELLED_DAYS = 30
export const DAYPART_DAYS = 30

/**
 * How many days of history the dashboard's trend lines read.
 *
 * Four weeks, because the comparison they drive is against the same weekday —
 * so this is really "four samples of each day", which is the fewest that can
 * tell a busy Saturday from a fluke.
 */
export const TREND_DAYS = 28

/** How many top sellers the dashboard lists. Enough to act on, short enough to scan. */
export const TOP_ITEMS_SHOWN = 5

/** Matches c_max_rows in staff_cancelled_orders(). */
export const MAX_CANCELLED_ROWS = 200
