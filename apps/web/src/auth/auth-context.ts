import { createContext, useContext } from 'react'
import type { StaffRole } from '@/data/role-store.ts'

// Staff sign in with a magic link; their row in `staff` decides access and
// role (TODO 4.1, KB §2: staff only, no rider logins). Providers live in
// auth.tsx.

export type AuthState =
  | { status: 'loading' }
  /** A production build without Supabase settings: refuse rather than open up. */
  | { status: 'unconfigured' }
  | { status: 'signed-out' }
  /** Signed in, but not on the staff list. */
  | { status: 'no-access'; email: string | null }
  /** `mock`: a dev build without Supabase, on mock data with the role switcher. */
  | { status: 'staff'; email: string | null; role: StaffRole; mock: boolean }
  | { status: 'error'; message: string }

export type SignInResult = { ok: true } | { ok: false; message: string }

export interface Auth {
  state: AuthState
  signIn: (email: string) => Promise<SignInResult>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<Auth | null>(null)

export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth needs an AuthProvider')
  return auth
}
