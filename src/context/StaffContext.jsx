import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { fetchStaffRole } from '../api/staff'
import { STAFF_ROLES } from '../config/staff'
import { useAuth } from './AuthContext'

const StaffContext = createContext(null)

/**
 * Who the current session is, as far as the database is concerned.
 *
 * Re-fetched whenever the session changes, and never persisted. The role lives
 * in React state for one page view only — writing it to localStorage would turn
 * a server-enforced fact into a client-editable one, and the whole point of
 * staff_role() is that the answer comes from Postgres.
 */
export function StaffProvider({ children }) {
  const { session, ready: authReady } = useAuth()
  const [role, setRole] = useState(null)
  const [ready, setReady] = useState(false)
  const [nonce, setNonce] = useState(0)

  /** Ask the database again — used after signing in or out. */
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!authReady) return undefined

    if (!session) {
      setRole(null)
      setReady(true)
      return undefined
    }

    let cancelled = false
    setReady(false)

    fetchStaffRole().then(({ role: next }) => {
      if (cancelled) return
      setRole(next)
      setReady(true)
    })

    return () => {
      cancelled = true
    }
  }, [session, authReady, nonce])

  const value = useMemo(
    () => ({
      role,
      ready: authReady && ready,
      isManager: role === STAFF_ROLES.manager,
      isAdmin: role === STAFF_ROLES.admin,
      isChef: role === STAFF_ROLES.chef,
      isStaff: role !== null,
      reload,
    }),
    [role, ready, authReady, reload],
  )

  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>
}

export function useStaff() {
  const ctx = useContext(StaffContext)
  if (!ctx) throw new Error('useStaff must be used inside StaffProvider')
  return ctx
}
