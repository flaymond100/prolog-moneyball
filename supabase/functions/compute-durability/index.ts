// compute-durability (TODO 5.6): POST with x-cron-secret. An empty body works
// on the last few days; {"from": "YYYY-MM-DD"} on every ride since that day;
// {"after": "<next_after>"} carries on a run that a budget stopped. The logic
// lives in ../_shared/durability.ts; this file only wires Deno to it.

import { createClient } from '@supabase/supabase-js'
import { cronSecretMatches } from '../_shared/cron-auth.ts'
import { parseDurabilityRequest, runComputeDurability } from '../_shared/durability.ts'
import { IcuClient } from '../_shared/icu.ts'
import { SupabaseDurabilityStore } from '../_shared/supabase-durability-store.ts'

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
  const parsed = parseDurabilityRequest(body, new Date().toISOString().slice(0, 10))
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const result = await runComputeDurability({
    client: new IcuClient({ apiKey: env('INTERVALS_API_KEY') }),
    store: new SupabaseDurabilityStore(db),
    after: parsed.after,
    now: () => new Date(),
  })
  console.info(
    JSON.stringify({
      durability: {
        run_id: result.run_id,
        status: result.status,
        rides: result.rides,
        efforts: result.efforts,
        skipped: result.skipped,
        curve_check: result.curve_check,
        api_calls: result.api_calls,
        stopped_by: result.stopped_by,
      },
    }),
  )
  return Response.json(result, { status: result.status === 'failed' ? 500 : 200 })
})
