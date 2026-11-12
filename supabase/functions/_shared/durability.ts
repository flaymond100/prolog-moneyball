// compute-durability (TODO 5.6, KB §6): for rides over 2 h, fetches the
// per-second power stream and stores the best 1/5/20 min power after
// 10/20/30 kJ/kg of work in durability_efforts.
//
// The arithmetic lives in @prolog/metrics. Storage sits behind
// DurabilityStore and the API behind IcuClient, so there is no IO here.

import { bestPowerAfterWork } from '@prolog/metrics'
import { DAILY_CALL_LIMIT, DAILY_HEADROOM } from './backfill.ts'
import { icuStreamsSchema, type IcuClient } from './icu.ts'
import type { RunLog } from './refresh.ts'
import { addDays, type SyncError } from './sync.ts'

export const DURABILITY_JOB = 'compute-durability'
/** Work buckets and durations of durability_efforts (KB §6). */
export const KJ_KG_BUCKETS = [10, 20, 30] as const
export const DURATIONS_S = [60, 300, 1200] as const
/** A nightly run looks this far back, like the sync, for rides it has not done yet. */
export const LOOKBACK_DAYS = 4
/** One API call per ride; a run stays well inside a minute (TODO 5.6 AC). */
export const MAX_RIDES = 25
export const TIME_BUDGET_MS = 45_000
/** Share of samples that must be 1 s apart for a stream to count as per-second. */
const MIN_PER_SECOND_SHARE = 0.9

// Rows ----------------------------------------------------------------------

/** A durability_candidates row. */
export interface DurabilityCandidate {
  activity_id: string
  athlete_id: string
  start_date_local: string
  weight_kg: number | null
  curve_secs: number[]
  curve_watts: number[]
}
/** A durability_efforts row. */
export interface DurabilityEffortRow {
  activity_id: string
  kj_kg_bucket: number
  duration_s: number
  watts: number
  wkg: number
  computed_at: string
}

export interface DurabilityStore extends RunLog {
  /** API calls logged by runs that started since UTC midnight. */
  callsToday(): Promise<number>
  /** Rides over 2 h that started after `after` and have no efforts yet, oldest first. */
  durabilityCandidates(after: string, limit: number): Promise<DurabilityCandidate[]>
  upsertDurabilityEfforts(rows: DurabilityEffortRow[]): Promise<void>
}

export interface DurabilityResult {
  run_id: number
  status: 'succeeded' | 'partial' | 'failed'
  /** Rides whose efforts were stored. */
  rides: number
  efforts: number
  /** Rides left out, by reason. */
  skipped: {
    /** The rider has no body weight, so kJ/kg is unknown. */
    without_weight: number
    /** No power stream came back. */
    without_stream: number
    /** The stream is not one sample per second. */
    not_per_second: number
    /** The ride never reaches 10 kJ/kg with an effort left to ride. */
    without_efforts: number
  }
  /**
   * How far the stream's own best 1/5/20 min power is from the ride's stored
   * intervals.icu curve, in per cent of the curve, over the rides compared.
   */
  curve_check: { rides: number; max_diff_pct: number | null }
  errors: SyncError[]
  api_calls: number
  stopped_by: 'call_budget' | 'time_budget' | 'max_rides' | null
  /** Pass as `after` to carry on when a budget stopped the run; null when done. */
  next_after: string | null
}

// Request -------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/

/**
 * Where to start from a request body: `{"from": "YYYY-MM-DD"}` for every ride
 * since that day, `{"after": "<next_after>"}` to carry on a run, or the last
 * few days for an empty body.
 */
export function parseDurabilityRequest(
  body: unknown,
  today: string,
): { ok: true; after: string } | { ok: false; error: string } {
  const fields = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  if ('after' in fields) {
    const after = fields.after
    if (typeof after !== 'string' || !ISO_LOCAL.test(after) || Number.isNaN(Date.parse(after))) {
      return { ok: false, error: 'after must be the next_after of an earlier run' }
    }
    return { ok: true, after }
  }
  let from = addDays(today, -LOOKBACK_DAYS)
  if ('from' in fields) {
    if (
      typeof fields.from !== 'string' ||
      !ISO_DATE.test(fields.from) ||
      Number.isNaN(Date.parse(fields.from))
    ) {
      return { ok: false, error: 'from must be a date, YYYY-MM-DD' }
    }
    from = fields.from
  }
  // The cursor is exclusive: the last second of the day before.
  return { ok: true, after: `${addDays(from, -1)}T23:59:59` }
}

// One ride ------------------------------------------------------------------

/** True when most consecutive samples of a `time` stream are 1 s apart. */
export function isPerSecond(time: readonly (number | null)[]): boolean {
  let steps = 0
  let ones = 0
  let previous: number | null = null
  for (const t of time) {
    if (t !== null && previous !== null) {
      steps++
      if (t - previous === 1) ones++
    }
    previous = t
  }
  return steps > 0 && ones >= MIN_PER_SECOND_SHARE * steps
}

/** Largest gap, in per cent, between the stream's bests and the ride's stored curve. */
function curveDiffPct(
  watts: readonly (number | null)[],
  candidate: DurabilityCandidate,
): number | null {
  // Mass does not matter at 0 kJ/kg.
  const fresh = bestPowerAfterWork(watts, 1, [0], DURATIONS_S)
  let max: number | null = null
  for (const best of fresh) {
    const stored = candidate.curve_watts[candidate.curve_secs.indexOf(best.durationS)]
    if (stored === undefined || !(stored > 0)) continue
    const diff = (100 * Math.abs(best.watts - stored)) / stored
    if (max === null || diff > max) max = diff
  }
  return max
}

// Job -----------------------------------------------------------------------

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Works through the rides after `after` until done or a budget is spent, and logs the run. */
export async function runComputeDurability(options: {
  client: IcuClient
  store: DurabilityStore
  after: string
  now: () => Date
  clock?: () => number // ms, for the time budget
  maxRides?: number
}): Promise<DurabilityResult> {
  const { client, store, after } = options
  const clock = options.clock ?? Date.now
  const maxRides = options.maxRides ?? MAX_RIDES
  const started = clock()
  const runId = await store.startRun(DURABILITY_JOB, { after })

  const skipped = { without_weight: 0, without_stream: 0, not_per_second: 0, without_efforts: 0 }
  const errors: SyncError[] = []
  const athletes = new Set<string>()
  let rides = 0
  let efforts = 0
  let checked = 0
  let maxDiff: number | null = null
  let stoppedBy: DurabilityResult['stopped_by'] = null
  let nextAfter: string | null = null
  let fatal = false

  try {
    const budget = DAILY_CALL_LIMIT - DAILY_HEADROOM - (await store.callsToday())
    // One more than a run handles, to know whether rides are left.
    const candidates = await store.durabilityCandidates(after, maxRides + 1)
    let handled = 0
    for (const candidate of candidates) {
      if (handled >= maxRides) stoppedBy = 'max_rides'
      else if (client.calls >= budget) stoppedBy = 'call_budget'
      else if (clock() - started >= TIME_BUDGET_MS) stoppedBy = 'time_budget'
      if (stoppedBy) break
      handled++
      nextAfter = candidate.start_date_local

      if (candidate.weight_kg === null) {
        skipped.without_weight++
        continue
      }
      try {
        const streams = await client.get(
          `/activity/${encodeURIComponent(candidate.activity_id)}/streams.json`,
          icuStreamsSchema,
          { types: 'watts,time' },
        )
        const watts = streams.find((s) => s.type === 'watts')?.data ?? []
        const time = streams.find((s) => s.type === 'time')?.data
        if (!watts.some((w) => w !== null && w > 0)) {
          skipped.without_stream++
          continue
        }
        if (time && !isPerSecond(time)) {
          skipped.not_per_second++
          continue
        }
        const diff = curveDiffPct(watts, candidate)
        if (diff !== null) {
          checked++
          if (maxDiff === null || diff > maxDiff) maxDiff = diff
        }

        const weight = candidate.weight_kg
        const computedAt = options.now().toISOString()
        const rows = bestPowerAfterWork(watts, weight, KJ_KG_BUCKETS, DURATIONS_S).map(
          (best): DurabilityEffortRow => ({
            activity_id: candidate.activity_id,
            kj_kg_bucket: best.kjPerKg,
            duration_s: best.durationS,
            watts: best.watts,
            wkg: best.watts / weight,
            computed_at: computedAt,
          }),
        )
        // 0 W over a whole effort is not a best; the table wants positive power.
        const positive = rows.filter((row) => row.watts > 0)
        if (positive.length === 0) {
          skipped.without_efforts++
          continue
        }
        await store.upsertDurabilityEfforts(positive)
        athletes.add(candidate.athlete_id)
        rides++
        efforts += positive.length
      } catch (error) {
        errors.push({ athlete_id: candidate.athlete_id, step: 'streams', message: message(error) })
      }
    }
    // Done when no budget stopped the run; otherwise carry on after the last ride handled.
    nextAfter = stoppedBy ? (nextAfter ?? after) : null
  } catch (error) {
    fatal = true
    errors.push({ athlete_id: null, step: 'candidates', message: message(error) })
  }

  const status =
    fatal || (errors.length > 0 && rides === 0)
      ? 'failed'
      : errors.length > 0
        ? 'partial'
        : 'succeeded'
  await store.finishRun(runId, {
    status,
    athlete_ids: [...athletes],
    counts: { durability_efforts: efforts, rides },
    errors,
    api_calls: client.calls,
    rate_limit_remaining: client.rateLimitRemaining,
  })
  return {
    run_id: runId,
    status,
    rides,
    efforts,
    skipped,
    curve_check: { rides: checked, max_diff_pct: maxDiff },
    errors,
    api_calls: client.calls,
    stopped_by: stoppedBy,
    next_after: nextAfter,
  }
}
