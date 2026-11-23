// Runs the nightly model jobs over the synthetic seed (TODO 9.1): ratings, then
// rider type, CA and PA, weekly for the last 16 weeks and today, so the views
// get 28-day changes and history. Local stack only.
//
//   pnpm seed:derive        (after `supabase db reset`)
//
// The root script reads API_URL and SERVICE_ROLE_KEY from `supabase status`.
// The jobs are the ones the Edge Functions run (../_shared), with the same stores.

import { createClient } from '@supabase/supabase-js'
import { runComputeCa } from '../_shared/ca.ts'
import { runComputeRatings } from '../_shared/ratings.ts'
import { SupabaseCaStore } from '../_shared/supabase-ca-store.ts'
import { SupabaseRatingsStore } from '../_shared/supabase-ratings-store.ts'

// Node globals without pulling Node types into the Deno-targeted package.
declare const process: { env: Record<string, string | undefined>; exitCode?: number }

const WEEKS = 16

const url = process.env.API_URL ?? ''
const key = process.env.SERVICE_ROLE_KEY ?? ''
// Synthetic riders never go near the live project.
const host = URL.canParse(url) ? new URL(url).hostname : ''
if (!['127.0.0.1', 'localhost'].includes(host) || !key) {
  throw new Error('derive-seed runs on the local stack only: start it and run pnpm seed:derive')
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const ratingsStore = new SupabaseRatingsStore(db)
const caStore = new SupabaseCaStore(db)

const today = new Date()
for (let week = WEEKS; week >= 0; week--) {
  const day = new Date(today.getTime() - week * 7 * 86_400_000)
  const asOf = day.toISOString().slice(0, 10)
  const ratings = await runComputeRatings({ store: ratingsStore, asOf, now: new Date() })
  const ca = await runComputeCa({ store: caStore, asOf, now: new Date() })
  console.info(
    `${asOf}: ${ratings.ratings} ratings, CA for ${ca.riders} riders, PA for ${ca.with_pa}` +
      (ratings.without_weight > 0 ? `, ${ratings.without_weight} bests without weight` : ''),
  )
}
