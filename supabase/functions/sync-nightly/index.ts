// sync-nightly (TODO 3.4): called by pg_cron at 02:30 UTC with x-cron-secret.
// The logic lives in ../_shared/sync.ts; this file only wires Deno to it.

import { createClient } from '@supabase/supabase-js'
import { cronSecretMatches } from '../_shared/cron-auth.ts'
import { IcuClient } from '../_shared/icu.ts'
import { SupabaseSyncStore } from '../_shared/supabase-store.ts'
import { runNightlySync } from '../_shared/sync.ts'

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

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const result = await runNightlySync({
    client: new IcuClient({ apiKey: env('INTERVALS_API_KEY') }),
    store: new SupabaseSyncStore(db),
    today: new Date().toISOString().slice(0, 10),
  })
  console.info(
    JSON.stringify({
      sync: { run_id: result.run_id, status: result.status, api_calls: result.api_calls },
    }),
  )
  return Response.json(result, { status: result.status === 'failed' ? 500 : 200 })
})
