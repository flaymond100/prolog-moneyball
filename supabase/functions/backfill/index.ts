// backfill (TODO 3.5): POST {from, to, athlete_id?, resume?} with x-cron-secret.
// Each call works within a call and time budget and returns `next` to carry
// on; scripts/backfill.ts keeps calling until it is null. Logic lives in
// ../_shared/backfill.ts.

import { createClient } from '@supabase/supabase-js'
import { parseBackfillRequest, runBackfill } from '../_shared/backfill.ts'
import { cronSecretMatches } from '../_shared/cron-auth.ts'
import { IcuClient } from '../_shared/icu.ts'
import { SupabaseSyncStore } from '../_shared/supabase-store.ts'

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

  const body: unknown = await request.json().catch(() => null)
  const parsed = parseBackfillRequest(body, new Date().toISOString().slice(0, 10))
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const result = await runBackfill({
    client: new IcuClient({ apiKey: env('INTERVALS_API_KEY') }),
    store: new SupabaseSyncStore(db),
    request: parsed.request,
  })
  console.info(
    JSON.stringify({
      backfill: {
        run_id: result.run_id,
        status: result.status,
        api_calls: result.api_calls,
        stopped_by: result.stopped_by,
      },
    }),
  )
  return Response.json(result, { status: result.status === 'failed' ? 500 : 200 })
})
