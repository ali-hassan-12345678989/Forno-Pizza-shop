import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { fetchShopSettings } from '../api/settings'

const SettingsContext = createContext(null)

/**
 * Shop details come from the database, not from a constants file, so there is
 * exactly one place a delivery fee or phone number lives.
 *
 * The app waits for this rather than shipping fallback values in code — a
 * fallback would be a second source of truth, and a stale one is worse than a
 * visible error. Every page already depends on Supabase for the menu anyway.
 */
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setError(null)
    fetchShopSettings()
      .then(setSettings)
      .catch((err) => setError(err.message))
  }, [])

  useEffect(load, [load])

  return (
    <SettingsContext.Provider value={{ settings, error, reload: load }}>
      {children}
    </SettingsContext.Provider>
  )
}

/** Only usable once settings have loaded — the gate in App renders nothing until then. */
export function useShop() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useShop must be used inside SettingsProvider')
  return ctx.settings
}

export function useSettingsStatus() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettingsStatus must be used inside SettingsProvider')
  return { settings: ctx.settings, error: ctx.error, reload: ctx.reload }
}
