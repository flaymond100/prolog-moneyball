// Runs a backfill to the end (TODO 3.5): calls the `backfill` function, then
// again with its `next` cursor, until the range is done or a call fails.
//
//   FUNCTIONS_URL=https://<ref>.supabase.co/functions/v1 \
//   node --experimental-strip-types --env-file=supabase/functions/.env \
//     supabase/functions/scripts/backfill.ts 2025-11-03 2026-11-02 [athlete_id]
//
// FUNCTIONS_URL defaults to the local stack. CRON_SECRET must match the
// target's secret. When the daily call budget is spent the function stops
// with stopped_by "call_budget"; run the printed command again tomorrow.

declare const process: {
  env: Record<string, string | undefined>
  argv: string[]
  exitCode?: number
}

const base = process.env.FUNCTIONS_URL ?? 'http://127.0.0.1:54321/functions/v1'
const secret = process.env.CRON_SECRET ?? ''
const [from, to, athleteId] = process.argv.slice(2)
if (!from || !to)
  throw new Error('Usage: backfill.ts <from YYYY-MM-DD> <to YYYY-MM-DD> [athlete_id]')

interface BackfillReply {
  status?: string
  api_calls?: number
  counts?: Record<string, number>
  errors?: { step: string; message: string }[]
  stopped_by?: string | null
  next?: unknown
  error?: string
}

let body: unknown = { from, to, ...(athleteId && { athlete_id: athleteId }) }
let total = 0
for (let call = 1; body; call++) {
  const res = await fetch(`${base}/backfill`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cron-secret': secret },
    body: JSON.stringify(body),
  })
  const result = (await res.json().catch(() => ({ error: res.statusText }))) as BackfillReply
  total += result.api_calls ?? 0
  console.log(
    `call ${call}: HTTP ${res.status} ${result.status ?? ''} · ${result.api_calls ?? 0} API calls · ${result.counts?.chunks ?? 0} chunks · ${result.counts?.activities ?? 0} activities${result.stopped_by ? ` · stopped by ${result.stopped_by}` : ''}`,
  )
  for (const e of result.errors ?? []) console.log(`  ✘ ${e.step}: ${e.message}`)
  if (!res.ok || result.error) {
    console.log(`  ✘ ${result.error ?? 'call failed'}`)
    process.exitCode = 1
    break
  }
  if (result.stopped_by === 'call_budget' && result.next) {
    console.log(
      `Daily budget spent. Resume tomorrow with this body:\n${JSON.stringify(result.next)}`,
    )
    break
  }
  body = result.next ?? null
}
console.log(`${total} API calls in total`)
