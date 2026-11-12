import { describe, expect, it } from 'vitest'
import {
  DURABILITY_JOB,
  isPerSecond,
  parseDurabilityRequest,
  runComputeDurability,
  type DurabilityCandidate,
  type DurabilityEffortRow,
  type DurabilityStore,
} from './durability.ts'
import type { RunResult } from './sync.ts'
import { api } from './test-helpers.ts'

const NOW = new Date('2026-11-12T03:05:00.000Z')
const AFTER = '2026-10-31T23:59:59'

// Synthetic streams -------------------------------------------------------------------

const block = (seconds: number, watts: number | null) =>
  Array.from({ length: seconds }, () => watts)

/** Streams as intervals.icu returns them, one sample per second. */
function streams(watts: (number | null)[], step = 1) {
  return [
    { type: 'watts', name: null, data: watts },
    { type: 'time', name: null, data: watts.map((_, i) => i * step) },
  ]
}

// A 60 kg rider: 10 kJ/kg is 600 kJ, 3,000 s at 200 W.
// 3,000 s at 200 W → 1,200 s at 250 W → 1,800 s at 200 W: 1,260 kJ in all, so
// 20 kJ/kg is reached 300 s before the end and 30 kJ/kg never.
const LONG_RIDE = [...block(3000, 200), ...block(1200, 250), ...block(1800, 200)]

function candidate(id: string, extra: Partial<DurabilityCandidate> = {}): DurabilityCandidate {
  return {
    activity_id: id,
    athlete_id: 'i1',
    start_date_local: `2026-11-0${id.slice(-1)}T09:00:00`,
    weight_kg: 60,
    curve_secs: [60, 300, 1200],
    curve_watts: [250, 250, 250],
    ...extra,
  }
}

// In-memory DurabilityStore -----------------------------------------------------------

class FakeDurabilityStore implements DurabilityStore {
  runs: { job: string; params: unknown; result?: RunResult }[] = []
  candidates: DurabilityCandidate[] = []
  efforts = new Map<string, DurabilityEffortRow>()
  callsTodayValue = 0
  failCandidates = false
  asked: { after: string; limit: number }[] = []

  startRun(job: string, params: Record<string, unknown>) {
    this.runs.push({ job, params })
    return Promise.resolve(this.runs.length)
  }
  finishRun(runId: number, result: RunResult) {
    const run = this.runs[runId - 1]
    if (run) run.result = result
    return Promise.resolve()
  }
  callsToday() {
    return Promise.resolve(this.callsTodayValue)
  }
  durabilityCandidates(after: string, limit: number) {
    this.asked.push({ after, limit })
    if (this.failCandidates) return Promise.reject(new Error('read durability candidates: down'))
    return Promise.resolve(
      this.candidates.filter((c) => c.start_date_local > after).slice(0, limit),
    )
  }
  upsertDurabilityEfforts(rows: DurabilityEffortRow[]) {
    for (const row of rows) {
      this.efforts.set(`${row.activity_id}|${row.kj_kg_bucket}|${row.duration_s}`, row)
    }
    return Promise.resolve()
  }
}

function setup(routes: Record<string, unknown>, candidates: DurabilityCandidate[]) {
  const store = new FakeDurabilityStore()
  store.candidates = candidates
  const { client, requests } = api(routes)
  const run = (extra: { clock?: () => number; maxRides?: number; after?: string } = {}) =>
    runComputeDurability({ client, store, after: AFTER, now: () => NOW, ...extra })
  return { store, requests, run }
}

describe('runComputeDurability', () => {
  it('stores the best efforts after each work bucket from a synthetic stream', async () => {
    const { store, requests, run } = setup({ '/activity/r1/streams.json': streams(LONG_RIDE) }, [
      candidate('r1'),
    ])
    const result = await run()

    expect(requests.map((url) => url.pathname + url.search)).toEqual([
      '/api/v1/activity/r1/streams.json?types=watts%2Ctime',
    ])
    expect(
      [...store.efforts.values()].map((e) => [e.kj_kg_bucket, e.duration_s, e.watts, e.wkg]),
    ).toEqual([
      [10, 60, 250, 250 / 60],
      [10, 300, 250, 250 / 60],
      [10, 1200, 250, 250 / 60],
      [20, 60, 200, 200 / 60],
      [20, 300, 200, 200 / 60],
    ])
    expect([...store.efforts.values()][0]).toMatchObject({
      activity_id: 'r1',
      computed_at: NOW.toISOString(),
    })
    expect(result).toEqual({
      run_id: 1,
      status: 'succeeded',
      rides: 1,
      efforts: 5,
      skipped: { without_weight: 0, without_stream: 0, not_per_second: 0, without_efforts: 0 },
      // The stream's own best 1/5/20 min equal the stored curve.
      curve_check: { rides: 1, max_diff_pct: 0 },
      errors: [],
      api_calls: 1,
      stopped_by: null,
      next_after: null,
    })
  })

  it('logs one run with its counts and API calls', async () => {
    const { store, run } = setup({ '/activity/r1/streams.json': streams(LONG_RIDE) }, [
      candidate('r1'),
    ])
    await run()
    expect(store.runs).toEqual([
      {
        job: DURABILITY_JOB,
        params: { after: AFTER },
        result: {
          status: 'succeeded',
          athlete_ids: ['i1'],
          counts: { durability_efforts: 5, rides: 1 },
          errors: [],
          api_calls: 1,
          rate_limit_remaining: null,
        },
      },
    ])
  })

  it('reports how far the stream is from the stored curve', async () => {
    const { run } = setup({ '/activity/r1/streams.json': streams(LONG_RIDE) }, [
      candidate('r1', { curve_secs: [60, 300], curve_watts: [250, 200] }),
    ])
    const result = await run()
    // 5 min: 250 W from the stream against 200 W stored.
    expect(result.curve_check).toEqual({ rides: 1, max_diff_pct: 25 })
  })

  it('skips a rider without a body weight without calling the API', async () => {
    const { store, requests, run } = setup({}, [candidate('r1', { weight_kg: null })])
    const result = await run()
    expect(requests).toEqual([])
    expect(result).toMatchObject({ status: 'succeeded', rides: 0, api_calls: 0 })
    expect(result.skipped.without_weight).toBe(1)
    expect(store.efforts.size).toBe(0)
  })

  it('skips a ride without power, with an irregular stream or without an effort to store', async () => {
    const { store, run } = setup(
      {
        '/activity/r1/streams.json': [{ type: 'watts', data: null }],
        '/activity/r2/streams.json': streams(block(8000, 0)),
        '/activity/r3/streams.json': streams(LONG_RIDE, 2), // a sample every 2 s
        '/activity/r4/streams.json': streams(block(2000, 150)), // 5 kJ/kg in all
        '/activity/r5/streams.json': [{ type: 'watts', data: LONG_RIDE }], // no time stream
      },
      ['r1', 'r2', 'r3', 'r4', 'r5'].map((id) => candidate(id)),
    )
    const result = await run()
    expect(result.skipped).toEqual({
      without_weight: 0,
      without_stream: 2,
      not_per_second: 1,
      without_efforts: 1,
    })
    expect(result).toMatchObject({ status: 'succeeded', rides: 1, efforts: 5, api_calls: 5 })
    expect(new Set([...store.efforts.values()].map((e) => e.activity_id))).toEqual(new Set(['r5']))
  })

  it('carries on past a ride whose stream fails, and is partial', async () => {
    const { run } = setup({ '/activity/r2/streams.json': streams(LONG_RIDE) }, [
      candidate('r1'),
      candidate('r2'),
    ])
    const result = await run()
    expect(result).toMatchObject({ status: 'partial', rides: 1, efforts: 5 })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ athlete_id: 'i1', step: 'streams' })
  })

  it('fails when no ride could be worked out', async () => {
    const { store, run } = setup({}, [candidate('r1')])
    const result = await run()
    expect(result).toMatchObject({ status: 'failed', rides: 0 })
    expect(store.runs[0]?.result?.status).toBe('failed')
  })

  it('fails when the rides cannot be read', async () => {
    const { store, run } = setup({}, [])
    store.failCandidates = true
    const result = await run()
    expect(result.status).toBe('failed')
    expect(result.errors).toEqual([
      { athlete_id: null, step: 'candidates', message: 'read durability candidates: down' },
    ])
  })

  it('stops at the ride limit and says where to carry on', async () => {
    const { store, run } = setup(
      {
        '/activity/r1/streams.json': streams(LONG_RIDE),
        '/activity/r2/streams.json': streams(LONG_RIDE),
      },
      [candidate('r1'), candidate('r2')],
    )
    const first = await run({ maxRides: 1 })
    expect(store.asked[0]).toEqual({ after: AFTER, limit: 2 })
    expect(first).toMatchObject({
      rides: 1,
      stopped_by: 'max_rides',
      next_after: '2026-11-01T09:00:00',
    })

    const second = await run({ maxRides: 1, after: first.next_after ?? '' })
    expect(second).toMatchObject({ rides: 1, stopped_by: null, next_after: null })
    expect(new Set([...store.efforts.values()].map((e) => e.activity_id))).toEqual(
      new Set(['r1', 'r2']),
    )
  })

  it('stops when the time budget is spent', async () => {
    const { run } = setup(
      {
        '/activity/r1/streams.json': streams(LONG_RIDE),
        '/activity/r2/streams.json': streams(LONG_RIDE),
      },
      [candidate('r1'), candidate('r2')],
    )
    // Started at 0; the clock reads 0 before the first ride and 60 s before the second.
    const times = [0, 0, 60_000]
    const result = await run({ clock: () => times.shift() ?? 60_000 })
    expect(result).toMatchObject({
      rides: 1,
      stopped_by: 'time_budget',
      next_after: '2026-11-01T09:00:00',
    })
  })

  it('does nothing once the day’s API calls are spent', async () => {
    const { store, requests, run } = setup({}, [candidate('r1')])
    store.callsTodayValue = 4_500 // the limit less the headroom kept for the sync
    const result = await run()
    expect(requests).toEqual([])
    expect(result).toMatchObject({
      status: 'succeeded',
      rides: 0,
      stopped_by: 'call_budget',
      next_after: AFTER,
    })
  })
})

describe('isPerSecond', () => {
  it('accepts a stream with a few pauses', () => {
    expect(isPerSecond([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 300, 301])).toBe(true)
  })

  it('refuses coarser sampling and empty streams', () => {
    expect(isPerSecond([0, 2, 4, 6, 8])).toBe(false)
    expect(isPerSecond([0, 1, 2, 10, 20, 30])).toBe(false)
    expect(isPerSecond([])).toBe(false)
    expect(isPerSecond([5])).toBe(false)
  })

  it('ignores missing samples', () => {
    expect(isPerSecond([0, 1, null, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe(true)
  })
})

describe('parseDurabilityRequest', () => {
  const today = '2026-11-12'

  it('looks back a few days by default', () => {
    expect(parseDurabilityRequest(null, today)).toEqual({ ok: true, after: '2026-11-07T23:59:59' })
    expect(parseDurabilityRequest({}, today)).toEqual({ ok: true, after: '2026-11-07T23:59:59' })
  })

  it('starts from a given day, inclusive', () => {
    expect(parseDurabilityRequest({ from: '2026-10-01' }, today)).toEqual({
      ok: true,
      after: '2026-09-30T23:59:59',
    })
  })

  it('carries on after a cursor', () => {
    expect(parseDurabilityRequest({ after: '2026-10-14T09:30:00' }, today)).toEqual({
      ok: true,
      after: '2026-10-14T09:30:00',
    })
  })

  it('refuses anything else', () => {
    expect(parseDurabilityRequest({ from: '14 October 2026' }, today)).toEqual({
      ok: false,
      error: 'from must be a date, YYYY-MM-DD',
    })
    expect(parseDurabilityRequest({ from: 20261014 }, today).ok).toBe(false)
    expect(parseDurabilityRequest({ after: '2026-10-14' }, today)).toEqual({
      ok: false,
      error: 'after must be the next_after of an earlier run',
    })
    expect(parseDurabilityRequest({ after: null }, today).ok).toBe(false)
  })
})
