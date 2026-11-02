import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthContext, type Auth, type AuthState } from '@/auth/auth-context.ts'
import { setRole } from '@/data/role-store.ts'
import { supabase } from '@/lib/supabase.ts'

/** For tests and previews: a fixed auth state with no Supabase behind it. */
export function StaticAuthProvider({ state, children }: { state: AuthState; children: ReactNode }) {
  const value = useMemo<Auth>(
    () => ({
      state,
      signIn: () => Promise.resolve({ ok: true }),
      signOut: () => Promise.resolve(),
    }),
    [state],
  )
  useEffect(() => {
    if (state.status === 'staff') setRole(state.role)
  }, [state])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

const MOCK_STAFF: AuthState = { status: 'staff', email: null, role: 'coach', mock: true }

// The magic link comes back to the app's base URL with `?code=…`; once the
// session exists the code is spent, so drop it from the address bar.
function removeAuthCode() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('code')) return
  url.searchParams.delete('code')
  window.history.replaceState(window.history.state, '', url)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() =>
    supabase
      ? { status: 'loading' }
      : import.meta.env.DEV
        ? MOCK_STAFF
        : { status: 'unconfigured' },
  )

  useEffect(() => {
    const client = supabase
    if (!client) return

    async function resolve(session: Session | null) {
      if (!session || !client) {
        setState({ status: 'signed-out' })
        return
      }
      removeAuthCode()
      const email = session.user.email ?? null
      const { data, error } = await client
        .from('staff')
        .select('role')
        .eq('user_id', session.user.id)
        .limit(1)
      if (error) {
        setState({ status: 'error', message: error.message })
        return
      }
      const row = data[0]
      if (!row) {
        setState({ status: 'no-access', email })
        return
      }
      setRole(row.role)
      setState({ status: 'staff', email, role: row.role, mock: false })
    }

    // Fires once with the stored session (INITIAL_SESSION), then on every
    // sign-in and sign-out. Other Supabase calls inside the callback can
    // deadlock the auth lock, so the staff lookup runs on the next tick.
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => void resolve(session), 0)
    })
    return () => {
      data.subscription.unsubscribe()
    }
  }, [])

  const auth = useMemo<Auth>(
    () => ({
      state,
      async signIn(email) {
        if (!supabase) return { ok: false, message: 'Sign-in is not configured for this build.' }
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            // Staff accounts are created by the coach; a sign-in never creates one.
            shouldCreateUser: false,
            emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
          },
        })
        if (!error) return { ok: true }
        if (error.status === 429) {
          return { ok: false, message: 'Too many sign-in requests. Try again in a minute.' }
        }
        // An unknown address fails as "signups not allowed"; answer as for a
        // staff address so the form never reveals who has an account.
        if (error.status === 400 || error.status === 422) return { ok: true }
        return { ok: false, message: 'The sign-in link could not be sent. Try again later.' }
      },
      async signOut() {
        if (supabase) await supabase.auth.signOut()
      },
    }),
    [state],
  )

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}
