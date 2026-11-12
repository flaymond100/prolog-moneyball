// refresh-derived (TODO 5.7): called by pg_cron at 03:15 UTC with
// x-cron-secret; an optional body {"as_of": "YYYY-MM-DD"} works on a past day
// instead of today. The logic lives in ../_shared/refresh.ts; this file only
// wires Deno to it.

import { createClient } from '@supabase/supabase-js'
import { cronSecretMatches } from '../_shared/cron-auth.ts'
import { IcuClient } from '../_shared/icu.ts'
import { parseAsOf } from '../_shared/ratings.ts'
import { runRefreshDerived } from '../_shared/refresh.ts'
import { SupabaseCaStore } from '../_shared/supabase-ca-store.ts'
import { SupabaseDurabilityStore } from '../_shared/supabase-durability-store.ts'
import { SupabaseRatingsStore } from '../_shared/supabase-ratings-store.ts'

// Deno globals used here, without pulling Deno types into the Node toolchain.
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): unknown
}

function env(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not set`)
  return value
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  if (!cronSecretMatches(request, Deno.env.get('CRON_SECRET'))) {
    return new Response('Unauthorised', { status: 401 })
  }

  const now = new Date()
  const body: unknown = await request.json().catch(() => null)
  const parsed = parseAsOf(body, now.toISOString().slice(0, 10))
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const durabilityStore = new SupabaseDurabilityStore(db)
  const result = await runRefreshDerived({
    log: durabilityStore,
    client: new IcuClient({ apiKey: env('INTERVALS_API_KEY') }),
    durabilityStore,
    ratingsStore: new SupabaseRatingsStore(db),
    caStore: new SupabaseCaStore(db),
    asOf: parsed.asOf,
    now,
  })
  console.info(
    JSON.stringify({
      refresh: {
        run_id: result.run_id,
        status: result.status,
        as_of: result.as_of,
        errors: result.errors,
      },
    }),
  )
  return Response.json(result, { status: result.status === 'failed' ? 500 : 200 })
})
