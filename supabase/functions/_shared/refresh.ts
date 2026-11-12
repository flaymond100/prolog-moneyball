// refresh-derived (TODO 5.7): runs the Phase 7 jobs in order after the nightly
// sync — ratings, then rider type and CA — and logs one sync_runs row.
//
// Each job reads what the one before wrote, so the first failure stops the
// run. PA and forecasts join the chain with TODO 7.4–7.6, materialised views
// with TODO 5.2.

import { runComputeCa, type CaResult, type CaStore } from './ca.ts'
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
  ratings: RatingsResult | null
  ca: CaResult | null
  errors: SyncError[]
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Rates the day, then types the riders and works out CA. Succeeded when both
 * jobs ran, partial when CA failed after the ratings were written, failed
 * when the ratings failed (CA is then not attempted).
 */
export async function runRefreshDerived(options: {
  log: RunLog
  ratingsStore: RatingsStore
  caStore: CaStore
  asOf: string
  now: Date
}): Promise<RefreshResult> {
  const { log, asOf, now } = options
  const runId = await log.startRun(REFRESH_JOB, { as_of: asOf })

  let ratings: RatingsResult | null = null
  let ca: CaResult | null = null
  const errors: SyncError[] = []
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

  const status = ratings === null ? 'failed' : ca === null ? 'partial' : 'succeeded'
  await log.finishRun(runId, {
    status,
    athlete_ids: [],
    counts: { rider_ratings: ratings?.ratings ?? 0, rider_ca_pa: ca?.riders ?? 0 },
    errors,
    api_calls: 0, // no intervals.icu calls
    rate_limit_remaining: null,
  })
  return { run_id: runId, status, as_of: asOf, ratings, ca, errors }
}
