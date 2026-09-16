// Every URL in the app. Nothing should ever write a path as a string literal.
export const ROUTES = {
  home: '/',
  menu: '/menu',
  cart: '/cart',
  checkout: '/checkout',
  orders: '/orders',
  track: '/track',
  trackOrder: '/track/:token',
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
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(last)

  return isUuid ? last.toLowerCase() : null
}
