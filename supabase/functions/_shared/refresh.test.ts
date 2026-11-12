import { describe, expect, it } from 'vitest'
import type { CaRow, CaStore, RatedAttribute } from './ca.ts'
import type { RatingAttribute, RatingRow, RatingsStore } from './ratings.ts'
import { REFRESH_JOB, runRefreshDerived, type RunLog } from './refresh.ts'
import type { RunResult } from './sync.ts'

const AS_OF = '2026-11-12'
const NOW = new Date('2026-11-12T03:15:00.000Z')
const SET_ID = 'female-pro-coggan-v1'
const POWER: RatingAttribute[] = ['p5s', 'p30s', 'p1m', 'p5m', 'p20m', 'p60m']

// One shared "database": a rider whose six power bests all rate 15, and what
// the jobs wrote, in order.
class FakeDb implements RunLog, RatingsStore, CaStore {
  events: string[] = []
  runs: { job: string; params: unknown; result?: RunResult }[] = []
  ratingRows: RatingRow[] = []
  caRows: CaRow[] = []
  failRatings = false
  failCa = false

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
      points: new Map(POWER.map((a) => [a, { method: 'z_score', mean: 10, sd: 1 } as const])),
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

function refresh(db: FakeDb) {
  return runRefreshDerived({ log: db, ratingsStore: db, caStore: db, asOf: AS_OF, now: NOW })
}

describe('runRefreshDerived', () => {
  it('rates, then types and works out CA from those ratings, and logs one run', async () => {
    const db = new FakeDb()
    const result = await refresh(db)

    expect(db.events).toEqual([
      'start run',
      'write ratings',
      'read ratings',
      'write CA',
      'finish run',
    ])
    expect(result).toMatchObject({ run_id: 1, status: 'succeeded', as_of: AS_OF, errors: [] })
    expect(result.ratings).toMatchObject({ riders: 1, ratings: 6 })
    expect(result.ca).toMatchObject({ riders: 1, without_power_profile: 0 })
    expect(db.caRows[0]).toMatchObject({ athlete_id: 'a', primary_type: 'all_rounder' })
    expect(db.caRows[0]?.ca).toBeCloseTo(15, 10)

    expect(db.runs).toEqual([
      {
        job: REFRESH_JOB,
        params: { as_of: AS_OF },
        result: {
          status: 'succeeded',
          athlete_ids: [],
          counts: { rider_ratings: 6, rider_ca_pa: 1 },
          errors: [],
          api_calls: 0,
          rate_limit_remaining: null,
        },
      },
    ])
  })

  it('fails and does not attempt CA when the ratings fail', async () => {
    const db = new FakeDb()
    db.failRatings = true
    const result = await refresh(db)

    expect(db.events).toEqual(['start run', 'finish run'])
    expect(result).toMatchObject({ status: 'failed', ratings: null, ca: null })
    expect(result.errors).toEqual([
      { athlete_id: null, step: 'ratings', message: 'read active benchmark set: timeout' },
    ])
    expect(db.runs[0]?.result).toMatchObject({
      status: 'failed',
      counts: { rider_ratings: 0, rider_ca_pa: 0 },
      errors: result.errors,
    })
  })

  it('is partial when CA fails after the ratings were written', async () => {
    const db = new FakeDb()
    db.failCa = true
    const result = await refresh(db)

    expect(db.events).toEqual(['start run', 'write ratings', 'read ratings', 'finish run'])
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
      counts: { rider_ratings: 6, rider_ca_pa: 0 },
    })
  })
})
