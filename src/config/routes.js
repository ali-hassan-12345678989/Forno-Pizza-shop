import { isUuid } from '../lib/uuid'

// Every URL in the app. Nothing should ever write a path as a string literal.
export const ROUTES = {
  home: '/',
  menu: '/menu',
  cart: '/cart',
  checkout: '/checkout',
  orders: '/orders',
  track: '/track',
  trackOrder: '/track/:token',

  // Staff. Deliberately unlinked from anywhere in the customer UI - staff type
  // the address. Hiding them is not the protection; the database is. See
  // StaffGate, and the RLS on every table these pages read.
  staffLogin: '/staff',
  manager: '/manager',
  admin: '/admin',
  chef: '/chef',
  // Each panel's sections are child routes of the two above. The section's own
  // path fragment lives in config/staffNav.js next to its label and icon, so a
  // section is described in exactly one place; sectionPath() below joins them.

  notFound: '*',
}

/** Tracking link a guest keeps — the token is the only credential. */
export const trackPath = (token) => `${ROUTES.track}/${token}`

/** The four addresses only staff use, and everything underneath them. */
const STAFF_PATHS = [ROUTES.staffLogin, ROUTES.manager, ROUTES.admin, ROUTES.chef]

/**
 * Is this URL part of a staff panel?
 *
 * Read from ROUTES rather than spelled out, so adding a panel cannot leave this
 * behind. Used to decide what is worth prefetching, never to decide who may see
 * what — that is StaffGate's job, and the database's before it.
 */
export function isStaffPath(pathname) {
  const path = String(pathname ?? '')
  return STAFF_PATHS.some((base) => path === base || path.startsWith(`${base}/`))
}

/**
 * Pulls a token out of whatever the customer pasted — the whole tracking URL,
 * or just the token on its own. Returns null when it is neither.
 *
 * The query and fragment come off FIRST, and only then is the path split. The
 * earlier version split on `/`, `?` and `#` together and took the last piece,
 * which made `from=sms` the candidate for `/track/<token>?from=sms` and threw
 * the link away.
 *
 * That was written off as a robustness edge on the grounds that this app only
 * ever emits `/track/<token>`. It is not an edge: the app does not have to
 * append anything, because WhatsApp, SMS gateways and email clients add their
 * own tags to a link AFTER the customer receives it. A guest's tracking link is
 * their only way back to the order, so a rejected paste is a total failure for
 * that person.
 */
export function tokenFromInput(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null

  const path = trimmed.split(/[?#]/)[0]
  const last = path.split('/').filter(Boolean).pop() ?? ''

  return isUuid(last) ? last.toLowerCase() : null
}

/**
 * Absolute path of one panel section.
 *
 * The panel root is a ROUTES entry and the fragment comes from the nav config,
 * so neither half is ever written as a literal at a call site. The dashboard
 * is the index route and carries an empty fragment, which resolves to the
 * panel root itself.
 */
export function sectionPath(panelRoot, fragment) {
  return fragment ? `${panelRoot}/${fragment}` : panelRoot
}
