import { fetchMenu } from '../api/menu'
import { fetchReviewSummary } from '../api/reviews'

/**
 * Starts the menu requests before React exists.
 *
 * THE PROBLEM THIS SOLVES. SettingsGate renders nothing but a spinner until
 * `shop_settings` comes back, so the Menu page does not mount — and therefore
 * does not fetch — until that round trip has finished. Measured on the live
 * site, cold cache:
 *
 *     1035 -> 1325ms  shop_settings
 *     1349 -> 1749ms  menu_review_summary     24ms after settings finished
 *     1349 -> 1696ms  menu_items              24ms after settings finished
 *     menu on screen: 2329ms
 *
 * The menu does not depend on the settings. Nothing about a delivery fee or a
 * phone number decides what pizzas exist. The gate is the only reason it waits,
 * and the gap is the full duration of the first call.
 *
 * Priming from main.jsx puts both requests in flight at the same moment, which
 * is as early as either can possibly start — before the first render, never
 * mind the first paint.
 *
 * WHY A MODULE-LEVEL PROMISE RATHER THAN A CACHE. This is not a data cache and
 * must not become one: a customer who reloads the menu expects to see the menu
 * as it is now, not as it was when the tab opened. `consume` hands the promise
 * over exactly once and forgets it, so the second read — a retry after a
 * failure, or a remount — goes to the network like any other.
 */
let primed = null

/**
 * Fires the requests. Safe to call more than once; only the first does work.
 *
 * Skipped for staff routes: a Manager checking stock has no use for the
 * customer menu, and starting two requests they will never read costs them
 * bandwidth and the shop its free-tier quota.
 */
export function primeMenu() {
  if (primed) return primed

  primed = {
    menu: fetchMenu(),
    ratings: fetchReviewSummary(),
  }

  // Nobody is awaiting these yet. Without a handler attached now, a failure in
  // the window before Menu mounts is an unhandled rejection — noise in the
  // console at best, a reported crash at worst. The real handling still happens
  // in Menu.jsx; this only covers the gap.
  primed.menu.catch(() => {})
  primed.ratings.catch(() => {})

  return primed
}

/**
 * Takes whatever was primed, or starts fresh if nothing was.
 *
 * Clearing on the way out is what keeps a failed first attempt from being
 * handed to every later retry, which would make the retry button useless.
 */
export function consumeMenu() {
  const ready = primed ?? { menu: fetchMenu(), ratings: fetchReviewSummary() }
  primed = null
  return ready
}

/** Test seam: forget anything primed. */
export function resetPrimedMenu() {
  primed = null
}
