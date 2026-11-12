import { describe, expect, it } from 'vitest'
import type { CaRow, CaStore, RatedAttribute } from './ca.ts'
import type { DurabilityCandidate, DurabilityEffortRow, DurabilityStore } from './durability.ts'
import type { Benchmark } from '@prolog/metrics'
import type { RatingAttribute, RatingRow, RatingsStore } from './ratings.ts'
import { REFRESH_JOB, runRefreshDerived, type RunLog } from './refresh.ts'
import type { RunResult } from './sync.ts'
import { api } from './test-helpers.ts'

const AS_OF = '2026-11-12'
const NOW = new Date('2026-11-12T03:15:00.000Z')
const SET_ID = 'female-pro-coggan-v1'
const POWER: RatingAttribute[] = ['p5s', 'p30s', 'p1m', 'p5m', 'p20m', 'p60m']

// One shared "database": a rider whose six power bests all rate 15, and what
// the jobs wrote, in order.
class FakeDb implements RunLog, DurabilityStore, RatingsStore, CaStore {
  events: string[] = []
  runs: { job: string; params: unknown; result?: RunResult }[] = []
  ratingRows: RatingRow[] = []
  caRows: CaRow[] = []
  failRatings = false
  failCa = false
  failDurability = false
  rides: DurabilityCandidate[] = []
  efforts: DurabilityEffortRow[] = []
  durabilityAfter: string[] = []

  callsToday() {
    return Promise.resolve(0)
  }
  durabilityCandidates(after: string) {
    this.durabilityAfter.push(after)
    if (this.failDurability) return Promise.reject(new Error('read durability candidates: down'))
    return Promise.resolve(this.rides)
  }
  upsertDurabilityEfforts(rows: DurabilityEffortRow[]) {
    this.events.push('write durability')
    this.efforts.push(...rows)
    return Promise.resolve()
  }
  // Retained 96% for the one effort stored, so the rider gets a durability rating.
  durabilityProfile() {
    return Promise.resolve(
      this.efforts
        .filter((e) => e.kj_kg_bucket === 20 && e.duration_s === 300)
        .map((e) => ({
          athlete_id: 'a',
          kj_kg_bucket: e.kj_kg_bucket,
          duration_s: e.duration_s,
          retained_pct: 96,
        })),
    )
  }

  startRun(job: string, params: Record<string, unknown>) {
    this.events.push('start run')
    this.runs.push({ job, params })
    return Promise.resolve(this.runs.length)
  }
  finishRun(runId: number, result: RunResult) {
    this.events.push('finish run')
    const run = this.runs[runId - 1]
    if (run) run.result = result
    return Promise.resolve()
  }

  activeBenchmarks() {
    if (this.failRatings) return Promise.reject(new Error('read active benchmark set: timeout'))
    return Promise.resolve({
      set_id: SET_ID,
      points: new Map<RatingAttribute, Benchmark>([
        ...POWER.map((a): [RatingAttribute, Benchmark] => [
          a,
          { method: 'z_score', mean: 10, sd: 1 },
        ]),
        ['durability', { method: 'z_score', mean: 96, sd: 2 }],
      ]),
    })
  }
  activeSetId() {
    return Promise.resolve(SET_ID)
  }
  riders() {
    return Promise.resolve([{ athlete_id: 'a', in_squad: true, type_override: null }])
  }
  powerProfile() {
    return Promise.resolve(
      POWER.map((attribute) => ({
        athlete_id: 'a',
        attribute,
        best_84d_w: 600,
        best_84d_wkg: 10,
        confidence: 'high' as const,
      })),
    )
  }
  latestVo2max() {
    return Promise.resolve([])
  }
  replaceRatings(_asOf: string, _setId: string, _computedAt: string, rows: RatingRow[]) {
    this.events.push('write ratings')
    this.ratingRows = rows
    return Promise.resolve(0)
  }

  ratings(): Promise<RatedAttribute[]> {
    this.events.push('read ratings')
    return Promise.resolve(this.ratingRows)
  }
  caWeights() {
    return Promise.resolve(
      (['sprinter', 'puncheur', 'climber', 'rouleur_tt', 'all_rounder'] as const).flatMap((type) =>
        POWER.map((attribute) => ({
          riderType: type,
          attribute,
          weight: 10,
          absoluteWatts: false,
        })),
      ),
    )
  }
  riderTypePriors() {
    if (this.failCa) return Promise.resolve([])
    const flat = [0, 0, 0, 0, 0, 0]
    return Promise.resolve([
      { key: 'type.prototype.sprinter', value: [3, 2, 1, -1, -2, -3] },
      { key: 'type.prototype.puncheur', value: [0, 1, 2, 1, -1, -2] },
      { key: 'type.prototype.climber', value: [-3, -2, -1, 1, 2.5, 2] },
      { key: 'type.prototype.rouleur_tt', value: [-1, -1, -1, 0, 1.5, 2] },
      { key: 'type.prototype.all_rounder', value: flat },
      { key: 'type.bonus.sprinter_vlamax_min', value: 0.6 },
      { key: 'type.bonus.sprinter', value: 0.5 },
      { key: 'type.bonus.climber_mass_max', value: 55 },
      { key: 'type.bonus.climber', value: 0.5 },
      { key: 'type.bonus.rouleur_tt_abs20_percentile_min', value: 60 },
      { key: 'type.bonus.rouleur_tt', value: 0.5 },
      { key: 'type.softmax_tau', value: 4 },
    ])
  }
  latestVlamax() {
    return Promise.resolve(new Map<string, number>())
  }
  bodyMass() {
    return Promise.resolve(new Map<string, number>())
  }
  replaceCa(_asOf: string, _computedAt: string, rows: CaRow[]) {
    this.events.push('write CA')
    this.caRows = rows
    return Promise.resolve(0)
  }
}

// 60 kg: 20 kJ/kg is 1.2 MJ, 6,000 s at 200 W; then 600 s at 240 W.
const STREAM = [
  ...Array.from({ length: 6000 }, () => 200),
  ...Array.from({ length: 600 }, () => 240),
]
const RIDE: DurabilityCandidate = {
  activity_id: 'r1',
  athlete_id: 'a',
  start_date_local: '2026-11-11T09:00:00',
  weight_kg: 60,
  curve_secs: [60, 300],
  curve_watts: [240, 240],
}

function refresh(db: FakeDb, routes: Record<string, unknown> = {}) {
  const { client } = api(routes)
  return runRefreshDerived({
    log: db,
    client,
    durabilityStore: db,
    ratingsStore: db,
    caStore: db,
    asOf: AS_OF,
    now: NOW,
  })
}

describe('runRefreshDerived', () => {
  it('works out durability, rates with it, then types and works out CA, and logs the run', async () => {
    const db = new FakeDb()
    db.rides = [RIDE]
    const result = await refresh(db, {
      '/activity/r1/streams.json': [{ type: 'watts', data: STREAM }],
    })

    expect(db.events).toEqual([
      'start run',
      'start run', // the durability job logs its own run
      'write durability',
      'finish run',
      'write ratings',
      'read ratings',
      'write CA',
      'finish run',
    ])
    // The last few days before the day being refreshed.
    expect(db.durabilityAfter).toEqual(['2026-11-07T23:59:59'])
    expect(result).toMatchObject({ run_id: 1, status: 'succeeded', as_of: AS_OF, errors: [] })
    expect(result.durability).toMatchObject({ status: 'succeeded', rides: 1, efforts: 5 })
    // Six power ratings and the durability rating from the efforts just stored.
    expect(result.ratings).toMatchObject({ riders: 1, ratings: 7 })
    expect(db.ratingRows.find((r) => r.attribute === 'durability')).toMatchObject({
      value: 96,
      rating: 15,
    })
    expect(result.ca).toMatchObject({ riders: 1, without_power_profile: 0 })
    expect(db.caRows[0]).toMatchObject({ athlete_id: 'a', primary_type: 'all_rounder' })
    expect(db.caRows[0]?.ca).toBeCloseTo(15, 10)

    expect(db.runs.map((run) => [run.job, run.result?.status])).toEqual([
      [REFRESH_JOB, 'succeeded'],
      ['compute-durability', 'succeeded'],
    ])
    expect(db.runs[0]).toEqual({
      job: REFRESH_JOB,
      params: { as_of: AS_OF },
      result: {
        status: 'succeeded',
        athlete_ids: [],
        counts: { durability_efforts: 5, rider_ratings: 7, rider_ca_pa: 1 },
        errors: [],
        api_calls: 0,
        rate_limit_remaining: null,
      },
    })
    expect(db.runs[1]?.result?.api_calls).toBe(1)
  })

  it('still rates and works out CA when durability fails, and is partial', async () => {
    const db = new FakeDb()
    db.failDurability = true
    const result = await refresh(db)

    expect(db.events).toContain('write ratings')
    expect(db.events).toContain('write CA')
    expect(result.status).toBe('partial')
    expect(result.durability).toMatchObject({ status: 'failed' })
    expect(result.ratings).toMatchObject({ ratings: 6 })
    expect(result.errors).toEqual([
      { athlete_id: null, step: 'durability', message: 'compute-durability failed, run 2' },
    ])
  })

  it('fails and does not attempt CA when the ratings fail', async () => {
    const db = new FakeDb()
    db.failRatings = true
    const result = await refresh(db)

    expect(db.events).not.toContain('write ratings')
    expect(db.events).not.toContain('read ratings')
    expect(result).toMatchObject({ status: 'failed', ratings: null, ca: null })
    expect(result.errors).toEqual([
      { athlete_id: null, step: 'ratings', message: 'read active benchmark set: timeout' },
    ])
    expect(db.runs[0]?.result).toMatchObject({
      status: 'failed',
      counts: { durability_efforts: 0, rider_ratings: 0, rider_ca_pa: 0 },
      errors: result.errors,
    })
  })

  it('is partial when CA fails after the ratings were written', async () => {
    const db = new FakeDb()
    db.failCa = true
    const result = await refresh(db)

    expect(db.events).toContain('write ratings')
    expect(db.events).not.toContain('write CA')
    expect(result.status).toBe('partial')
    expect(result.ratings).toMatchObject({ ratings: 6 })
    expect(result.ca).toBeNull()
    expect(result.errors).toEqual([
      {
        athlete_id: null,
        step: 'ca',
        message: 'model_priors type.prototype.sprinter must be 6 numbers',
      },
    ])
    expect(db.runs[0]?.result).toMatchObject({
      status: 'partial',
      counts: { durability_efforts: 0, rider_ratings: 6, rider_ca_pa: 0 },
    })
  })
})
