import type { Benchmark } from '@prolog/metrics'
import { describe, expect, it } from 'vitest'
import {
  parseAsOf,
  rateRiders,
  runComputeRatings,
  type BenchmarkSet,
  type DurabilityProfileRow,
  type PowerProfileRow,
  type RatingAttribute,
  type RatingRow,
  type RatingsStore,
  type Rider,
  type Vo2maxRow,
} from './ratings.ts'

// KB §6 seed "Female Pro + Coggan provisional" (v1).
const anchors = (anchorValues: number[], anchorRatings: number[]): Benchmark => ({
  method: 'anchors',
  anchorValues,
  anchorRatings,
})
const KB_SET: BenchmarkSet = {
  set_id: 'female_pro_coggan_v1',
  points: new Map<RatingAttribute, Benchmark>([
    ['p5s', { method: 'z_score', mean: 15.3, sd: 1.8 }],
    ['p30s', { method: 'z_score', mean: 10.3, sd: 1.1 }],
    ['p1m', { method: 'z_score', mean: 8.4, sd: 0.8 }],
    ['p5m', anchors([4.65, 5.2, 5.8], [9, 12, 15])],
    ['p20m', anchors([4.11, 4.63, 5.11], [9, 12, 15])],
    ['p60m', { method: 'z_score', mean: 4.2, sd: 0.4 }],
    ['durability', anchors([85, 90, 95, 100], [9, 12, 15, 18])],
    ['vo2max', anchors([50, 57, 63, 70], [9, 12, 15, 18])],
  ]),
}

const AS_OF = '2026-11-11'
const COMPUTED_AT = '2026-11-11T03:15:00.000Z'

const squad = (...ids: string[]): Rider[] => ids.map((id) => ({ athlete_id: id, in_squad: true }))

function power(
  athleteId: string,
  attribute: RatingAttribute,
  wkg: number | null,
  watts: number | null = wkg === null ? 250 : wkg * 60,
  confidence: 'high' | 'low' | null = 'high',
): PowerProfileRow {
  return {
    athlete_id: athleteId,
    attribute,
    best_84d_w: watts,
    best_84d_wkg: wkg,
    confidence,
  }
}

function rate(input: {
  riders: Rider[]
  powerProfile?: PowerProfileRow[]
  durability?: DurabilityProfileRow[]
  vo2max?: Vo2maxRow[]
  benchmarks?: BenchmarkSet
}) {
  return rateRiders({
    asOf: AS_OF,
    computedAt: COMPUTED_AT,
    benchmarks: input.benchmarks ?? KB_SET,
    riders: input.riders,
    powerProfile: input.powerProfile ?? [],
    durability: input.durability ?? [],
    vo2max: input.vo2max ?? [],
  })
}

function retained(
  athleteId: string,
  bucket: number,
  durationS: number,
  pct: number | null,
): DurabilityProfileRow {
  return { athlete_id: athleteId, kj_kg_bucket: bucket, duration_s: durationS, retained_pct: pct }
}

function find(rows: RatingRow[], athleteId: string, attribute: RatingAttribute): RatingRow {
  const row = rows.find((r) => r.athlete_id === athleteId && r.attribute === attribute)
  if (!row) throw new Error(`no ${attribute} rating for ${athleteId}`)
  return row
}

describe('rateRiders', () => {
  it('reproduces the KB §6 worked examples', () => {
    const { rows } = rate({
      riders: squad('a'),
      powerProfile: [
        power('a', 'p5s', 15.3), // the pro mean
        power('a', 'p1m', 10), // +2 SD
        power('a', 'p60m', 4.1),
        power('a', 'p5m', 5.5), // between 5.20 → 12 and 5.80 → 15
        power('a', 'p20m', 4.63), // on an anchor
      ],
      vo2max: [{ athlete_id: 'a', vo2max_ml_kg_min: 63 }],
    })
    expect(find(rows, 'a', 'p5s').rating).toBeCloseTo(15, 10)
    expect(find(rows, 'a', 'p1m').rating).toBeCloseTo(20, 10)
    expect(find(rows, 'a', 'p60m').rating).toBeCloseTo(14.375, 10)
    expect(find(rows, 'a', 'p5m').rating).toBeCloseTo(13.5, 10)
    expect(find(rows, 'a', 'p20m').rating).toBeCloseTo(12, 10)
    expect(find(rows, 'a', 'vo2max').rating).toBeCloseTo(15, 10)
  })

  it('writes one complete rider_ratings row per rider and attribute', () => {
    const { rows } = rate({ riders: squad('a'), powerProfile: [power('a', 'p5s', 15.3)] })
    expect(rows).toEqual([
      {
        athlete_id: 'a',
        as_of: AS_OF,
        set_id: 'female_pro_coggan_v1',
        attribute: 'p5s',
        value: 15.3,
        rating: 15,
        squad_rating: null, // a squad of one has no squad rating
        confidence: 'high',
        watts: null,
        watts_squad_rating: null,
        computed_at: COMPUTED_AT,
      },
    ])
  })

  it('rates squad riders against each other, 1 for the weakest and 20 for the strongest', () => {
    const { rows } = rate({
      riders: squad('a', 'b', 'c'),
      powerProfile: [power('a', 'p5s', 14), power('b', 'p5s', 17), power('c', 'p5s', 15)],
    })
    expect(find(rows, 'a', 'p5s').squad_rating).toBe(1)
    expect(find(rows, 'b', 'p5s').squad_rating).toBe(20)
    expect(find(rows, 'c', 'p5s').squad_rating).toBe(10.5)
  })

  it('rates a prospect against the benchmark but keeps her out of the squad ranking', () => {
    const { rows } = rate({
      riders: [...squad('a', 'b'), { athlete_id: 'p', in_squad: false }],
      powerProfile: [power('a', 'p5s', 14), power('b', 'p5s', 17), power('p', 'p5s', 19)],
    })
    expect(find(rows, 'p', 'p5s').rating).toBeGreaterThan(20 - 1e-9)
    expect(find(rows, 'p', 'p5s').squad_rating).toBeNull()
    expect(find(rows, 'b', 'p5s').squad_rating).toBe(20)
  })

  it('adds absolute watts and their squad rating for 20 and 60 min only', () => {
    const { rows } = rate({
      riders: squad('a', 'b'),
      powerProfile: [
        // a is lighter: stronger per kg, weaker in watts.
        power('a', 'p20m', 5.0, 260),
        power('b', 'p20m', 4.5, 300),
        power('a', 'p60m', 4.1, 215),
        power('a', 'p5m', 5.5, 290),
        power('b', 'p5m', 5.2, 340),
      ],
    })
    expect(find(rows, 'a', 'p20m')).toMatchObject({
      squad_rating: 20,
      watts: 260,
      watts_squad_rating: 1,
    })
    expect(find(rows, 'b', 'p20m')).toMatchObject({
      squad_rating: 1,
      watts: 300,
      watts_squad_rating: 20,
    })
    expect(find(rows, 'a', 'p60m')).toMatchObject({ watts: 215, watts_squad_rating: null })
    expect(find(rows, 'a', 'p5m')).toMatchObject({ watts: null, watts_squad_rating: null })
  })

  it('carries power confidence and rates VO2max with high confidence', () => {
    const { rows } = rate({
      riders: squad('a'),
      powerProfile: [power('a', 'p1m', 8.4, 500, 'low')],
      vo2max: [{ athlete_id: 'a', vo2max_ml_kg_min: 57 }],
    })
    expect(find(rows, 'a', 'p1m').confidence).toBe('low')
    expect(find(rows, 'a', 'vo2max')).toMatchObject({ value: 57, rating: 12, confidence: 'high' })
  })

  it('rates durability on the mean retained % of 5 and 20 min after 20 and 30 kJ/kg', () => {
    const { rows } = rate({
      riders: squad('a', 'b', 'c'),
      durability: [
        retained('a', 20, 300, 96),
        retained('a', 20, 1200, 94),
        retained('a', 30, 300, 92),
        retained('a', 30, 1200, 90),
        // Not part of the rating: 1 min efforts and the 10 kJ/kg bucket.
        retained('a', 20, 60, 50),
        retained('a', 10, 300, 100),
        // b has two of the four; a value without fresh power is left out.
        retained('b', 20, 300, 95),
        retained('b', 20, 1200, 85),
        retained('b', 30, 300, null),
        // c has only values outside the rating.
        retained('c', 10, 1200, 99),
      ],
    })
    // a: mean 93 → between 90 → 12 and 95 → 15.
    expect(find(rows, 'a', 'durability')).toMatchObject({ value: 93, confidence: 'high' })
    expect(find(rows, 'a', 'durability').rating).toBeCloseTo(13.8, 10)
    expect(find(rows, 'a', 'durability').squad_rating).toBe(20)
    // b: mean 90 → 12.
    expect(find(rows, 'b', 'durability')).toMatchObject({ value: 90, rating: 12, squad_rating: 1 })
    expect(rows.filter((r) => r.athlete_id === 'c')).toEqual([])
  })

  it('leaves out a power best without W/kg and counts it', () => {
    const { rows, withoutWeight } = rate({
      riders: squad('a', 'b'),
      powerProfile: [power('a', 'p5s', null), power('a', 'p1m', null), power('b', 'p5s', 15)],
    })
    expect(rows.map((r) => r.athlete_id)).toEqual(['b'])
    expect(withoutWeight).toBe(2)
  })

  it('skips a duration without a ride in the 84-day window', () => {
    const { rows, withoutWeight } = rate({
      riders: squad('a'),
      powerProfile: [power('a', 'p5s', null, null, null)],
    })
    expect(rows).toEqual([])
    expect(withoutWeight).toBe(0)
  })

  it('ignores athletes who are not active riders', () => {
    const { rows, withoutWeight } = rate({
      riders: squad('a'),
      powerProfile: [power('gone', 'p5s', 16), power('gone', 'p1m', null), power('a', 'p5s', 15)],
      vo2max: [{ athlete_id: 'gone', vo2max_ml_kg_min: 60 }],
    })
    expect(rows.map((r) => r.athlete_id)).toEqual(['a'])
    expect(withoutWeight).toBe(0)
  })

  it('reports an attribute the set has no benchmark for and does not rate it', () => {
    const points = new Map(KB_SET.points)
    points.delete('vo2max')
    const { rows, withoutBenchmark } = rate({
      benchmarks: { set_id: 'partial', points },
      riders: squad('a'),
      powerProfile: [power('a', 'p5s', 15)],
      vo2max: [{ athlete_id: 'a', vo2max_ml_kg_min: 60 }],
    })
    expect(rows.map((r) => r.attribute)).toEqual(['p5s'])
    expect(withoutBenchmark).toEqual(['vo2max'])
  })
})

describe('parseAsOf', () => {
  const today = '2026-11-11'

  it('defaults to today without an as_of', () => {
    expect(parseAsOf(null, today)).toEqual({ ok: true, asOf: today })
    expect(parseAsOf({}, today)).toEqual({ ok: true, asOf: today })
    expect(parseAsOf('2026-11-01', today)).toEqual({ ok: true, asOf: today })
  })

  it('accepts today and past days', () => {
    expect(parseAsOf({ as_of: '2026-11-11' }, today)).toEqual({ ok: true, asOf: '2026-11-11' })
    expect(parseAsOf({ as_of: '2026-10-14' }, today)).toEqual({ ok: true, asOf: '2026-10-14' })
  })

  it('refuses a future day', () => {
    expect(parseAsOf({ as_of: '2026-11-12' }, today)).toEqual({
      ok: false,
      error: 'as_of must not be in the future',
    })
  })

  it('refuses anything that is not a date', () => {
    for (const asOf of [20261111, '11 November 2026', '2026-13-01', '2026-11-11T00:00:00Z', null]) {
      expect(parseAsOf({ as_of: asOf }, today)).toEqual({
        ok: false,
        error: 'as_of must be a date, YYYY-MM-DD',
      })
    }
  })
})

// In-memory RatingsStore keyed like rider_ratings ------------------------------

class FakeRatingsStore implements RatingsStore {
  benchmarks: BenchmarkSet | null = KB_SET
  riderRows: Rider[] = []
  profile: PowerProfileRow[] = []
  durability: DurabilityProfileRow[] = []
  vo2max: Vo2maxRow[] = []
  ratings = new Map<string, RatingRow>()
  asked: string[] = []

  activeBenchmarks() {
    return Promise.resolve(this.benchmarks)
  }
  riders() {
    return Promise.resolve(this.riderRows)
  }
  powerProfile(asOf: string) {
    this.asked.push(`power ${asOf}`)
    return Promise.resolve(this.profile)
  }
  durabilityProfile(asOf: string) {
    this.asked.push(`durability ${asOf}`)
    return Promise.resolve(this.durability)
  }
  latestVo2max(asOf: string) {
    this.asked.push(`vo2max ${asOf}`)
    return Promise.resolve(this.vo2max)
  }
  replaceRatings(asOf: string, setId: string, computedAt: string, rows: RatingRow[]) {
    for (const row of rows) {
      this.ratings.set([row.athlete_id, row.as_of, row.set_id, row.attribute].join('|'), row)
    }
    let deleted = 0
    for (const [key, row] of this.ratings) {
      if (row.as_of === asOf && row.set_id === setId && row.computed_at < computedAt) {
        this.ratings.delete(key)
        deleted++
      }
    }
    return Promise.resolve(deleted)
  }
}

describe('runComputeRatings', () => {
  it('rates the day and reports what it wrote', async () => {
    const store = new FakeRatingsStore()
    store.riderRows = squad('a', 'b')
    store.profile = [
      power('a', 'p5s', 15.3),
      power('b', 'p5s', 16),
      power('b', 'p1m', null),
      power('a', 'p60m', 4.1),
    ]
    store.vo2max = [{ athlete_id: 'a', vo2max_ml_kg_min: 63 }]

    const result = await runComputeRatings({
      store,
      asOf: '2026-11-10',
      now: new Date(COMPUTED_AT),
    })

    expect(result).toEqual({
      as_of: '2026-11-10',
      set_id: 'female_pro_coggan_v1',
      riders: 2,
      ratings: 4,
      deleted: 0,
      without_weight: 1,
      without_benchmark: [],
    })
    expect(store.asked).toEqual(['power 2026-11-10', 'durability 2026-11-10', 'vo2max 2026-11-10'])
    expect(store.ratings.size).toBe(4)
    const p60m = store.ratings.get('a|2026-11-10|female_pro_coggan_v1|p60m')
    expect(p60m?.rating).toBeCloseTo(14.375, 10)
    expect(p60m?.computed_at).toBe(COMPUTED_AT)
  })

  it('replaces the day on a re-run and drops ratings that no longer apply', async () => {
    const store = new FakeRatingsStore()
    store.riderRows = squad('a', 'b')
    store.profile = [power('a', 'p5s', 15.3), power('b', 'p5s', 16)]
    await runComputeRatings({ store, asOf: AS_OF, now: new Date('2026-11-11T03:15:00Z') })
    // Another day's rows stay untouched.
    await runComputeRatings({ store, asOf: '2026-11-10', now: new Date('2026-11-11T03:16:00Z') })

    store.profile = [power('a', 'p5s', 15.8)]
    const result = await runComputeRatings({
      store,
      asOf: AS_OF,
      now: new Date('2026-11-11T09:00:00Z'),
    })

    expect(result).toMatchObject({ ratings: 1, deleted: 1 })
    expect([...store.ratings.keys()].sort()).toEqual([
      'a|2026-11-10|female_pro_coggan_v1|p5s',
      'a|2026-11-11|female_pro_coggan_v1|p5s',
      'b|2026-11-10|female_pro_coggan_v1|p5s',
    ])
    expect(store.ratings.get('a|2026-11-11|female_pro_coggan_v1|p5s')?.value).toBe(15.8)
  })

  it('fails without an active benchmark set and writes nothing', async () => {
    const store = new FakeRatingsStore()
    store.benchmarks = null
    await expect(runComputeRatings({ store, asOf: AS_OF, now: new Date() })).rejects.toThrow(
      'No benchmark set is active',
    )
    expect(store.ratings.size).toBe(0)
  })
})
