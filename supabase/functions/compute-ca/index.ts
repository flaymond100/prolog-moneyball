// compute-ca (TODO 7.2, 7.3): POST with x-cron-secret, after compute-ratings;
// an optional body {"as_of": "YYYY-MM-DD"} works on a past day instead of
// today. The logic lives in ../_shared/ca.ts; this file only wires Deno to it.

import { createClient } from '@supabase/supabase-js'
import { runComputeCa } from '../_shared/ca.ts'
import { cronSecretMatches } from '../_shared/cron-auth.ts'
import { parseAsOf } from '../_shared/ratings.ts'
import { SupabaseCaStore } from '../_shared/supabase-ca-store.ts'

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
  const asOf = parsed.asOf

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  try {
    const result = await runComputeCa({ store: new SupabaseCaStore(db), asOf, now })
    console.info(JSON.stringify({ ca: result }))
    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(JSON.stringify({ ca: { as_of: asOf, error: message } }))
    return Response.json({ error: message }, { status: 500 })
  }
})
