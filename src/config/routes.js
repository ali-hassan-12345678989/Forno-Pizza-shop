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

/**
 * Pulls a token out of whatever the customer pasted — the whole tracking URL,
 * or just the token on its own. Returns null when it is neither.
 */
export function tokenFromInput(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null

  const last = trimmed.split(/[/?#]/).filter(Boolean).pop() ?? ''

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
