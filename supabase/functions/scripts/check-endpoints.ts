// TODO 3.3: hit each intervals.icu endpoint from KB §4 once for one rider and
// print what came back — status, counts, field names, curve ids and rate-limit
// header names. Never prints rider values, names, ids or the key.
//
//   node --experimental-strip-types --env-file=supabase/functions/.env \
//     supabase/functions/scripts/check-endpoints.ts
//
// Optional: ATHLETE_ID=i123 to pick the rider (default: the first coached
// athlete with a non-Strava activity in the last 28 days).

import {
  IcuClient,
  icuActivitiesSchema,
  icuActivitySchema,
  icuAthleteSummarySchema,
  icuEventsSchema,
  icuPowerCurvesSchema,
  icuWellnessSchema,
} from '../_shared/icu.ts'
import { z } from 'zod'

// Node globals without pulling Node types into the Deno-targeted package.
declare const process: { env: Record<string, string | undefined>; exitCode?: number }

const apiKey = process.env.INTERVALS_API_KEY ?? ''
const rateLimitHeaders = new Set<string>()
const client = new IcuClient({
  apiKey,
  log: (event) => {
    for (const name of Object.keys(event.rateLimit)) rateLimitHeaders.add(name)
  },
})

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
const keys = (rows: object[]) => [...new Set(rows.flatMap((r) => Object.keys(r)))].sort()
const has = (rows: object[], field: string) => rows.some((r) => field in r)

const summary = await client.get('/athlete/0/athlete-summary.json', icuAthleteSummarySchema)
console.log(
  `✔ athlete-summary: ${summary.length} coached athletes; fields: ${keys(summary).join(', ')}`,
)
const ids = summary.map((s) => s.athlete_id)
const redact = (text: string) => ids.reduce((t, id) => t.replaceAll(id, '<athlete>'), text)

async function check(label: string, run: () => Promise<string>) {
  try {
    console.log(`✔ ${label}: ${await run()}`)
  } catch (error) {
    process.exitCode = 1
    console.log(`✘ ${label}: ${redact(error instanceof Error ? error.message : String(error))}`)
  }
}

// Activities per athlete; pick the first with something other than Strava.
let a = ''
let activityIds: string[] = []
const candidates = process.env.ATHLETE_ID ? [process.env.ATHLETE_ID] : ids
for (const [index, athleteId] of candidates.entries()) {
  const path = `/athlete/${encodeURIComponent(athleteId)}`
  const rows = await client.get(`${path}/activities`, icuActivitiesSchema, {
    oldest: day(-28),
    newest: day(0),
  })
  const strava = rows.filter((r) => r.source === 'STRAVA').length
  const sources = [...new Set(rows.map((r) => r.source ?? 'none'))].join(', ')
  console.log(
    `✔ activities, athlete ${index + 1}: ${rows.length} in 28 days (${strava} from Strava); sources: ${sources}; ${keys(rows).length} fields; icu_intervals in list: ${has(rows, 'icu_intervals')}`,
  )
  activityIds = rows.filter((r) => r.source !== 'STRAVA').map((r) => r.id)
  a = encodeURIComponent(athleteId)
  if (activityIds.length > 0) {
    console.log(`  → checking the remaining endpoints with athlete ${index + 1}`)
    break
  }
}
if (!a) throw new Error('No coached athletes: has a rider added the coach yet?')

const first = activityIds[0]
if (first) {
  const id = encodeURIComponent(first)
  await check('activity?intervals=true', async () => {
    const act = await client.get(`/activity/${id}`, icuActivitySchema, { intervals: true })
    return `icu_intervals: ${act.icu_intervals?.length ?? 'absent'}; icu_groups: ${'icu_groups' in act}; icu_weight: ${'icu_weight' in act}`
  })
  await check('activities/{ids}?intervals=true (batch)', async () => {
    const ids = activityIds.slice(0, 3).map(encodeURIComponent).join(',')
    const rows = await client.get(`/athlete/${a}/activities/${ids}`, icuActivitiesSchema, {
      intervals: true,
    })
    return `${rows.length} of ${Math.min(3, activityIds.length)} returned; all with icu_intervals: ${rows.every((r) => Array.isArray(r.icu_intervals))}`
  })
  await check('streams.json', async () => {
    const streams = await client.get(
      `/activity/${id}/streams.json`,
      z.array(z.looseObject({ type: z.string(), data: z.array(z.unknown()).nullish() })),
      { types: 'watts,heartrate,cadence,altitude,time' },
    )
    return streams.map((s) => `${s.type}[${s.data?.length ?? 0}]`).join(', ')
  })
} else {
  console.log('– activity detail and streams skipped: no non-Strava activity in the last 28 days')
}

await check('wellness (last 7 days)', async () => {
  const rows = await client.get(`/athlete/${a}/wellness.json`, icuWellnessSchema, {
    oldest: day(-7),
    newest: day(0),
  })
  const flags = [
    'hrv',
    'restingHR',
    'weight',
    'sportInfo',
    'menstrualPhase',
    'menstrualPhasePredicted',
  ]
    .map((f) => `${f}: ${has(rows, f)}`)
    .join('; ')
  return `${rows.length} days; ${flags}`
})

for (const curves of ['42d,84d,s0', '1y']) {
  await check(`power-curves curves=${curves}`, async () => {
    const res = await client.get(`/athlete/${a}/power-curves.json`, icuPowerCurvesSchema, {
      type: 'Ride',
      curves,
    })
    return res.list
      .map((c) => {
        const days = 'days' in c ? String(c.days) : '?'
        return `${c.id} (${days} days, ${c.secs.length} points, W/kg: ${Array.isArray(c.watts_per_kg)})`
      })
      .join('; ')
  })
}

await check('mmp-model?type=Ride', async () => {
  const model = await client.get(`/athlete/${a}/mmp-model`, z.looseObject({}), { type: 'Ride' })
  return `fields: ${Object.keys(model).sort().join(', ')}`
})

// ±56 days so past events confirm the fields even when nothing is planned yet.
await check('events (±56 days, workouts and races)', async () => {
  const rows = await client.get(`/athlete/${a}/events.json`, icuEventsSchema, {
    oldest: day(-56),
    newest: day(56),
    category: 'WORKOUT,RACE_A,RACE_B,RACE_C',
  })
  const byCategory = Object.entries(
    rows.reduce<Record<string, number>>((acc, r) => {
      const c = r.category ?? 'none'
      acc[c] = (acc[c] ?? 0) + 1
      return acc
    }, {}),
  )
  return `${rows.length} events (${byCategory.map(([c, n]) => `${c} ${n}`).join(', ') || 'none'}); icu_training_load: ${has(rows, 'icu_training_load')}`
})

console.log(
  `\n${client.calls} API calls; rate-limit headers: ${[...rateLimitHeaders].join(', ') || 'none'}; last remaining: ${client.rateLimitRemaining ?? 'n/a'}`,
)
