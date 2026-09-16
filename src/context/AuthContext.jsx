import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext(null)

/**
 * Accounts are optional throughout. Nothing in the ordering flow may depend on
 * a session existing — a guest with no session must be able to complete an
 * order start to finish (FR-1.4).
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      email: session?.user?.email ?? null,
      isSignedIn: Boolean(session),
      ready,

      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return error?.message ?? null
      },

      async signUp(email, password) {
        const { error } = await supabase.auth.signUp({ email, password })
        return error?.message ?? null
      },

      async signOut() {
        await supabase.auth.signOut()
      },
    }),
    [session, ready],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
