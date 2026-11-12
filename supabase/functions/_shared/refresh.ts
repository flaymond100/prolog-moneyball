// refresh-derived (TODO 5.7): runs the derived-data jobs in order after the
// nightly sync — durability efforts for new long rides, then ratings, then
// rider type and CA — and logs one sync_runs row.
//
// Ratings read what durability wrote and CA reads the ratings. A durability
// failure does not stop the run: the ratings then use the efforts already
// stored. A ratings failure does, as CA would read stale ratings. PA and
// forecasts join the chain with TODO 7.4–7.6, materialised views with 5.2.

import { runComputeCa, type CaResult, type CaStore } from './ca.ts'
import {
  parseDurabilityRequest,
  runComputeDurability,
  type DurabilityResult,
  type DurabilityStore,
} from './durability.ts'
import type { IcuClient } from './icu.ts'
import { runComputeRatings, type RatingsResult, type RatingsStore } from './ratings.ts'
import type { RunResult, SyncError } from './sync.ts'

export const REFRESH_JOB = 'refresh-derived'

/** The sync_runs part of a store. */
export interface RunLog {
  startRun(job: string, params: Record<string, unknown>): Promise<number>
  finishRun(runId: number, result: RunResult): Promise<void>
}

export interface RefreshResult {
  run_id: number
  status: RunResult['status']
  as_of: string
  durability: DurabilityResult | null
  ratings: RatingsResult | null
  ca: CaResult | null
  errors: SyncError[]
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Works out durability efforts for the last few days' long rides, rates the
 * day, then types the riders and works out CA. Succeeded when every job ran
 * cleanly; partial when durability or CA had a problem but the ratings were
 * written; failed when the ratings failed (CA is then not attempted).
 */
export async function runRefreshDerived(options: {
  log: RunLog
  client: IcuClient
  durabilityStore: DurabilityStore
  ratingsStore: RatingsStore
  caStore: CaStore
  asOf: string
  now: Date
}): Promise<RefreshResult> {
  const { log, client, asOf, now } = options
  const runId = await log.startRun(REFRESH_JOB, { as_of: asOf })

  const errors: SyncError[] = []
  let durability: DurabilityResult | null = null
  try {
    // The job's own default window, counted back from the day being refreshed.
    const window = parseDurabilityRequest(null, asOf)
    if (!window.ok) throw new Error(window.error)
    durability = await runComputeDurability({
      client,
      store: options.durabilityStore,
      after: window.after,
      now: () => now,
    })
    if (durability.status !== 'succeeded') {
      errors.push({
        athlete_id: null,
        step: 'durability',
        message: `compute-durability ${durability.status}, run ${durability.run_id}`,
      })
    }
  } catch (error) {
    errors.push({ athlete_id: null, step: 'durability', message: message(error) })
  }

  let ratings: RatingsResult | null = null
  let ca: CaResult | null = null
  try {
    ratings = await runComputeRatings({ store: options.ratingsStore, asOf, now })
    try {
      ca = await runComputeCa({ store: options.caStore, asOf, now })
    } catch (error) {
      errors.push({ athlete_id: null, step: 'ca', message: message(error) })
    }
  } catch (error) {
    errors.push({ athlete_id: null, step: 'ratings', message: message(error) })
  }

  const status = ratings === null ? 'failed' : errors.length > 0 ? 'partial' : 'succeeded'
  await log.finishRun(runId, {
    status,
    athlete_ids: [],
    counts: {
      durability_efforts: durability?.efforts ?? 0,
      rider_ratings: ratings?.ratings ?? 0,
      rider_ca_pa: ca?.riders ?? 0,
    },
    errors,
    // The durability run logs its own intervals.icu calls.
    api_calls: 0,
    rate_limit_remaining: null,
  })
  return { run_id: runId, status, as_of: asOf, durability, ratings, ca, errors }
}
