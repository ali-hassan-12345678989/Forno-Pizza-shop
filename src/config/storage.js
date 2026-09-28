// Namespaced so nothing collides with other apps on the same origin.
const NS = 'forno'

export const STORAGE_KEYS = {
  orderType: `${NS}.orderType`,
  address: `${NS}.address`,
  cart: `${NS}.cart`,
  lastOrderToken: `${NS}.lastOrderToken`,
  /* The shop's own details from the last visit. Versioned in the key rather
     than validated on read: if the shape ever changes, a new key means the old
     value is ignored instead of half-understood. */
  shopSettings: `${NS}.shopSettings.v1`,
}

/** localStorage throws in private mode and when site data is blocked. */
export function readStored(key, fallback = null) {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function writeStored(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // A lost convenience is not worth breaking the page over.
  }
}

export function readJSON(key, fallback) {
  const raw = readStored(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function writeJSON(key, value) {
  writeStored(key, JSON.stringify(value))
}
