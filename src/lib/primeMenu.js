import { fetchMenu } from '../api/menu'
import { fetchReviewSummary } from '../api/reviews'

/**
 * Starts the menu requests before React exists.
 *
 * THE PROBLEM THIS SOLVES. SettingsGate renders nothing but a spinner until
 * `shop_settings` comes back, so the Menu page did not mount — and therefore
 * did not fetch — until that round trip had finished. Measured on the live
 * site, cold cache:
 *
 *     1035 -> 1325ms  shop_settings
 *     1349 -> 1749ms  menu_review_summary     24ms after settings finished
 *     1349 -> 1696ms  menu_items              24ms after settings finished
 *     menu on screen: 2329ms
 *
 * The menu does not depend on the settings. Nothing about a delivery fee or a
 * phone number decides what pizzas exist. The gate was the only reason it
 * waited, and the gap was the full duration of the first call.
 *
 * Priming from main.jsx puts both requests in flight at the same moment, which
 * is as early as either can start — before the first render, never mind the
 * first paint. Measured: the menu went from 956ms to 651ms on screen.
 */
let primed = null

/**
 * How long a primed answer stays good.
 *
 * The fourth audit caught this claiming to be a handover while behaving as a
 * cache with no age limit. A customer landing on the home page, reading it, and
 * clicking through to the menu ten minutes later was handed the answer fetched
 * ten minutes earlier — proven with fake timers: one fetch, no refetch.
 *
 * That matters because the menu is exactly the data that goes stale.
 * `is_sold_out` and `out_of_stock` are driven by the stock engine and flip
 * during service, so the stale copy shows a dish that sold out while they were
 * reading. They add it, fill in an address, and are refused at the last step.
 * It fails safe — place_order() raises `item_unavailable` and the message reads
 * well — but it is a wasted journey a fresh request would have prevented.
 *
 * Thirty seconds keeps the entire measured win. The whole point of priming is
 * the direct load, where the page mounts a few hundred milliseconds later and
 * is nowhere near this bound; the customer who browsed for ten minutes is the
 * one who should be paying for a fresh answer.
 */
const MAX_AGE_MS = 30_000

/** Which pages are worth paying two requests for before anyone asks. */
export function shouldPrefetchMenu(pathname) {
  const path = String(pathname ?? '')

  /* Only these two. `/menu` reads it immediately, and `/` is the page whose
     normal next step is clicking through to the menu, so the prefetch is
     usually collected.
     Everything else was waste: the fourth audit found `/cart`, `/checkout` and
     `/track/<token>` each firing two requests that nothing ever read. Staff
     routes never needed it at all — a Manager checking stock has no use for
     the customer menu, and two requests nobody reads still cost the shop's
     free-tier quota. */
  return path === '/' || path === '/menu'
}

/**
 * Fires the requests. Safe to call more than once; only the first does work.
 */
export function primeMenu(now = Date.now()) {
  if (primed) return primed

  primed = {
    at: now,
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
 * Takes whatever was primed, or starts fresh if nothing was — or if what was
 * primed has gone stale.
 *
 * Clearing on the way out is what keeps a failed first attempt from being
 * handed to every later retry, which would make the retry button useless: the
 * rejected promise would be re-served instantly and identically, forever.
 */
export function consumeMenu(now = Date.now()) {
  const usable = primed && now - primed.at < MAX_AGE_MS ? primed : null
  primed = null

  return usable ?? { at: now, menu: fetchMenu(), ratings: fetchReviewSummary() }
}

/** Test seam: forget anything primed. */
export function resetPrimedMenu() {
  primed = null
}

/** Exported so the tests assert against the real bound rather than a copy of it. */
export const PRIME_MAX_AGE_MS = MAX_AGE_MS
