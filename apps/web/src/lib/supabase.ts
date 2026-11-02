import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@prolog/types'

// The browser client. It only ever gets the project URL and the publishable
// key (CLAUDE.md); RLS decides what each staff role can read.
//
// PKCE, not the implicit flow: the implicit flow returns tokens in the URL
// hash, which hash routing already uses. The magic link comes back as
// `?code=…` and supabase-js exchanges it on load.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** Null when the build has no Supabase settings (a dev build on mock data). */
export const supabase: SupabaseClient<Database> | null =
  url && key
    ? createClient<Database>(url, key, {
        auth: {
          flowType: 'pkce',
          detectSessionInUrl: true,
          persistSession: true,
          storageKey: 'prolog-moneyball-auth',
        },
      })
    : null
