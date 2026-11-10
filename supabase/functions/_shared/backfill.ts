// Backfill (TODO 3.5): activities, wellness and each ride's power curve for a
// date range, in 30-day chunks, reusing the nightly sync's steps. Window power
// curves and planned events are today-only snapshots, so the nightly sync
// alone keeps them.
//
// A call stops before it runs out of API calls or wall-clock time and returns
// `next`: the request to send to carry on. Long backfills therefore span
// several calls, and several nights if the daily budget is spent.

import { z } from 'zod'
import type { IcuClient } from './icu.ts'
import {
  addDays,
  runResult,
  runStep,
  setupError,
  syncActivities,
  syncActivityPowerCurves,
  syncAthletes,
  syncWellness,
  type RunResult,
  type SyncContext,
  type SyncError,
  type SyncStore,
} from './sync.ts'

export const CHUNK_DAYS = 30
// KB §4: 5,000 calls a day. Headroom keeps the nightly sync (~90 calls) and
// manual checks within the limit while a backfill runs.
export const DAILY_CALL_LIMIT = 5_000
export const DAILY_HEADROOM = 500
// Edge Functions stop after 150 s of wall-clock time on the free plan.
export const DEFAULT_TIME_BUDGET_MS = 100_000

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-01.')

export const backfillRequestSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    athlete_id: z.string().min(1).optional(),
    resume: z.object({ athlete_id: z.string().min(1), from: isoDate }).optional(),
  })
  .refine((r) => r.from <= r.to, { message: '`from` must not be after `to`.', path: ['from'] })
  .refine((r) => !r.resume || (r.resume.from >= r.from && r.resume.from <= r.to), {
    message: '`resume.from` must lie between `from` and `to`.',
    path: ['resume', 'from'],
  })

export type BackfillRequest = z.infer<typeof backfillRequestSchema>

/** Validates a request body; `to` cannot be later than today. */
export function parseBackfillRequest(
  body: unknown,
  today: string,
): { ok: true; request: BackfillRequest } | { ok: false; error: string } {
  const parsed = backfillRequestSchema.safeParse(body)
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) }
  if (parsed.data.to > today) return { ok: false, error: '`to` cannot be in the future.' }
  return { ok: true, request: parsed.data }
}

export interface BackfillOptions {
  client: IcuClient
  store: SyncStore
  request: BackfillRequest
  /** Cap on API calls for this invocation, on top of the daily budget. */
  maxCalls?: number
  timeBudgetMs?: number
  clock?: () => number // ms, for the time budget
  now?: () => string // ISO timestamp for synced_at
}

export interface BackfillResult extends RunResult {
  run_id: number
  next: BackfillRequest | null
  stopped_by: 'call_budget' | 'time_budget' | null
}

export async function runBackfill(options: BackfillOptions): Promise<BackfillResult> {
  const { client, store, request } = options
  const clock = options.clock ?? Date.now
  const timeBudget = options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS
  const ctx: SyncContext = {
    client,
    store,
    counts: {},
    now: options.now ?? (() => new Date().toISOString()),
  }
  const errors: SyncError[] = []
  const athleteIds: string[] = []
  let next: BackfillRequest | null = null
  let stoppedBy: BackfillResult['stopped_by'] = null
  const started = clock()
  const runId = await store.startRun('backfill', request)

  try {
    const [coached, consents, usedToday, scope] = await Promise.all([
      syncAthletes(ctx, false),
      store.cycleConsentAthletes(),
      store.callsToday(),
      store.wellnessScope(),
    ])
    const budget = Math.min(
      options.maxCalls ?? Infinity,
      DAILY_CALL_LIMIT - DAILY_HEADROOM - usedToday,
    )

    // Sorted so a resume cursor always means the same rest of the squad.
    let ids = [...coached].sort()
    if (request.athlete_id !== undefined) {
      if (!ids.includes(request.athlete_id)) {
        throw new Error(`${request.athlete_id} is not a coached athlete`)
      }
      ids = [request.athlete_id]
    }
    if (request.resume) {
      const at = ids.indexOf(request.resume.athlete_id)
      if (at < 0)
        throw new Error(`cannot resume: ${request.resume.athlete_id} is not in this backfill`)
      ids = ids.slice(at)
    }
    athleteIds.push(...ids)

    squad: for (const athleteId of ids) {
      let chunkStart = request.resume?.athlete_id === athleteId ? request.resume.from : request.from
      while (chunkStart <= request.to) {
        if (client.calls >= budget) stoppedBy = 'call_budget'
        else if (clock() - started >= timeBudget) stoppedBy = 'time_budget'
        if (stoppedBy) {
          next = {
            from: request.from,
            to: request.to,
            ...(request.athlete_id !== undefined && { athlete_id: request.athlete_id }),
            resume: { athlete_id: athleteId, from: chunkStart },
          }
          break squad
        }
        const chunkEnd = [addDays(chunkStart, CHUNK_DAYS - 1), request.to].sort()[0] ?? request.to
        const range = `${chunkStart}..${chunkEnd}`
        // A failing chunk is recorded and the backfill moves on.
        await runStep(errors, athleteId, `activities ${range}`, () =>
          syncActivities(ctx, athleteId, chunkStart, chunkEnd),
        )
        await runStep(errors, athleteId, `wellness ${range}`, () =>
          syncWellness(ctx, athleteId, chunkStart, chunkEnd, consents.has(athleteId), scope),
        )
        await runStep(errors, athleteId, `activity power curves ${range}`, () =>
          syncActivityPowerCurves(ctx, athleteId, chunkStart, chunkEnd),
        )
        ctx.counts.chunks = (ctx.counts.chunks ?? 0) + 1
        chunkStart = addDays(chunkEnd, 1)
      }
    }
  } catch (error) {
    errors.push(setupError(error))
  }

  const result = runResult(ctx, athleteIds, errors)
  await store.finishRun(runId, result)
  return { run_id: runId, ...result, next, stopped_by: stoppedBy }
}
