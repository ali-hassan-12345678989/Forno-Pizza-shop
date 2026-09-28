import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { fetchShopSettings } from '../api/settings'
import { STORAGE_KEYS, readJSON, writeJSON } from '../config/storage'

const SettingsContext = createContext(null)

/** Every field a screen reads, so a truncated cache is discarded rather than used. */
const REQUIRED_FIELDS = [
  'name',
  'tagline',
  'phone',
  'phoneHref',
  'address',
  'hours',
  'deliveryEta',
  'pickupEta',
  'deliveryFee',
]

/**
 * A cached copy is only usable if it has everything. A half-written value —
 * storage full, quota hit mid-write, an older build's shape — would otherwise
 * render as a header with blanks in it, which looks broken in a way a spinner
 * never does.
 */
function usableCache(value) {
  if (!value || typeof value !== 'object') return null
  const complete = REQUIRED_FIELDS.every(
    (field) => value[field] !== undefined && value[field] !== null && value[field] !== '',
  )
  return complete && Number.isFinite(Number(value.deliveryFee)) ? value : null
}

/**
 * Shop details come from the database, not from a constants file, so there is
 * exactly one place a delivery fee or phone number lives.
 *
 * WHY THERE IS A CACHE AT ALL. SettingsGate holds the entire app back until
 * this arrives — no header, no hero, no menu. Measured on a production build,
 * the home page's headline appeared at 790ms, and that headline is static copy
 * that does not use a single field from here. The shop was making every
 * visitor wait on a round trip to render words that were already in the
 * bundle.
 *
 * Reading the last visit's answer first lets a returning customer see the whole
 * shopfront immediately, while the real request goes out anyway and corrects it
 * a moment later. A first-time visitor is unchanged — there is nothing to read,
 * so they get exactly the gate they got before.
 *
 * This is NOT a second source of truth. The cache is never authoritative and
 * never consulted once the network has answered; it is last-known-good, shown
 * for the few hundred milliseconds before the truth arrives, and overwritten by
 * it. The fields it covers — a name, a phone number, opening hours — change
 * perhaps once a year.
 *
 * `fresh` is the part that keeps that honest. Anything showing the customer
 * money waits for it. A delivery fee read from a stale cache could put a total
 * on screen that differs from the one the kitchen charges, and while
 * place_order() recomputes every total server-side and so cannot be tricked,
 * quoting a price and then charging another is its own kind of wrong.
 */
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => usableCache(readJSON(STORAGE_KEYS.shopSettings)))
  const [fresh, setFresh] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setError(null)
    fetchShopSettings()
      .then((next) => {
        setSettings(next)
        setFresh(true)
        writeJSON(STORAGE_KEYS.shopSettings, next)
      })
      .catch((err) => {
        // A cached copy is better than an error screen: the shop is reachable
        // by phone from the header either way, and the customer can still
        // read the menu. With nothing cached there is nothing to show, so the
        // gate's error and its retry stand.
        if (!settings) setError(err.message)
      })
    // `settings` is deliberately not a dependency. Including it would rebuild
    // this callback the moment the cache loaded and fire a second request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(load, [load])

  return (
    <SettingsContext.Provider value={{ settings, fresh, error, reload: load }}>
      {children}
    </SettingsContext.Provider>
  )
}

/** Only usable once settings exist — the gate in main.jsx renders nothing until then. */
export function useShop() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useShop must be used inside SettingsProvider')
  return ctx.settings
}

/**
 * True once the values came from the database on this page view.
 *
 * Used by the two screens that show a total. Everywhere else, a name and a
 * phone number from the last visit are worth more than a spinner.
 */
export function useSettingsAreFresh() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettingsAreFresh must be used inside SettingsProvider')
  return ctx.fresh
}

export function useSettingsStatus() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettingsStatus must be used inside SettingsProvider')
  return { settings: ctx.settings, error: ctx.error, reload: ctx.reload }
}
