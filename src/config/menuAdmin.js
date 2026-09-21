/**
 * Limits on editing the menu.
 *
 * These mirror the constants inside admin_save_menu_item() and
 * admin_save_menu_size() in supabase/admin_menu.sql. A browser cannot read a
 * Postgres constant, so the duplication is unavoidable — what is avoidable is
 * it drifting unnoticed. tests/admin-menu.test.js probes the real database at
 * each boundary using these exact values.
 */

/** Matches c_max_name. */
export const MAX_ITEM_NAME = 80

/** Matches c_max_desc. */
export const MAX_ITEM_DESCRIPTION = 300

/** Matches c_max_short — category, badge and size label all share it. */
export const MAX_SHORT_TEXT = 40

/** Matches c_max_price. */
export const MAX_ITEM_PRICE = 100000

/** menu_item_sizes.price is numeric(10,2). */
export const PRICE_DECIMALS = 2
