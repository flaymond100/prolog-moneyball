import { RIDER_TYPES, type CaWeight, type RiderType } from '@prolog/metrics'
import { describe, expect, it } from 'vitest'
import {
  MODEL_VERSION,
  parseRiderTypePriors,
  rateAbility,
  runComputeCa,
  type CaRider,
  type CaRow,
  type CaStore,
  type PriorRow,
  type RatedAttribute,
} from './ca.ts'
import type { Confidence, RatingAttribute } from './ratings.ts'

// KB §7 seeds, as rows of model_priors and ca_weights -----------------------------

const PRIOR_ROWS: PriorRow[] = [
  { key: 'type.prototype.sprinter', value: [3, 2, 1, -1, -2, -3] },
  { key: 'type.prototype.puncheur', value: [0, 1, 2, 1, -1, -2] },
  { key: 'type.prototype.climber', value: [-3, -2, -1, 1, 2.5, 2] },
  { key: 'type.prototype.rouleur_tt', value: [-1, -1, -1, 0, 1.5, 2] },
  { key: 'type.prototype.all_rounder', value: [0, 0, 0, 0, 0, 0] },
  { key: 'type.bonus.sprinter_vlamax_min', value: 0.6 },
  { key: 'type.bonus.sprinter', value: 0.5 },
  { key: 'type.bonus.climber_mass_max', value: 55 },
  { key: 'type.bonus.climber', value: 0.5 },
  { key: 'type.bonus.rouleur_tt_abs20_percentile_min', value: 60 },
  { key: 'type.bonus.rouleur_tt', value: 0.5 },
  { key: 'type.softmax_tau', value: 4 },
]
const PRIORS = parseRiderTypePriors(PRIOR_ROWS)

// Columns in RIDER_TYPES order.
const MATRIX: Record<string, readonly number[]> = {
  p5s: [25, 10, 0, 5, 8],
  p30s: [15, 10, 5, 5, 8],
  p1m: [15, 20, 5, 5, 12],
  p5m: [5, 20, 20, 10, 15],
  p20m: [5, 5, 25, 25, 15],
  p60m: [5, 5, 15, 20, 12],
  durability: [25, 25, 25, 25, 25],
  vo2max: [5, 5, 5, 5, 5],
}
const WEIGHTS: CaWeight[] = Object.entries(MATRIX).flatMap(([attribute, row]) =>
  RIDER_TYPES.map((riderType, i) => ({
    riderType,
    attribute,
    weight: row[i] ?? Number.NaN,
    absoluteWatts: riderType === 'rouleur_tt' && (attribute === 'p20m' || attribute === 'p60m'),
  })),
)

// Riders ----------------------------------------------------------------------------

const AS_OF = '2026-11-12'
const COMPUTED_AT = '2026-11-12T03:20:00.000Z'
const SET_ID = 'female-pro-coggan-v1'

function rider(id: string, extra: Partial<CaRider> = {}): CaRider {
  return { athlete_id: id, in_squad: true, type_override: null, ...extra }
}

function rated(
  athleteId: string,
  attribute: RatingAttribute,
  rating: number,
  extra: { confidence?: Confidence; watts?: number; wattsSquadRating?: number } = {},
): RatedAttribute {
  return {
    athlete_id: athleteId,
    attribute,
    rating,
    confidence: extra.confidence ?? 'high',
    watts: extra.watts ?? null,
    watts_squad_rating: extra.wattsSquadRating ?? null,
  }
}

/** Six power ratings in shape order; 20 and 60 min carry their absolute rating too. */
function power(athleteId: string, ratings: number[], watts20m?: number): RatedAttribute[] {
  const attributes: RatingAttribute[] = ['p5s', 'p30s', 'p1m', 'p5m', 'p20m', 'p60m']
  return attributes.flatMap((attribute, i) => {
    const rating = ratings[i]
    if (rating === undefined) return []
    const absolute = attribute === 'p20m' || attribute === 'p60m'
    return rated(athleteId, attribute, rating, {
      ...(absolute && { wattsSquadRating: rating }),
      ...(attribute === 'p20m' && watts20m !== undefined && { watts: watts20m }),
    })
  })
}

// The hand-worked climber of the dashboard's mock data: CA 13.9.
function erika(id = 'e'): RatedAttribute[] {
  return [
    ...power(id, [10, 10, 11, 15, 14, 14]).map((r) =>
      r.attribute === 'p1m' ? { ...r, confidence: 'low' as const } : r,
    ),
    rated(id, 'durability', 14),
    rated(id, 'vo2max', 15),
  ]
}

function rate(input: {
  riders: CaRider[]
  ratings: RatedAttribute[]
  vlamax?: Record<string, number>
  bodyMass?: Record<string, number>
}) {
  return rateAbility({
    asOf: AS_OF,
    setId: SET_ID,
    computedAt: COMPUTED_AT,
    riders: input.riders,
    ratings: input.ratings,
    weights: WEIGHTS,
    priors: PRIORS,
    vlamax: new Map(Object.entries(input.vlamax ?? {})),
    bodyMass: new Map(Object.entries(input.bodyMass ?? {})),
  })
}

function find(rows: CaRow[], athleteId: string): CaRow {
  const row = rows.find((r) => r.athlete_id === athleteId)
  if (!row) throw new Error(`no CA row for ${athleteId}`)
  return row
}

describe('parseRiderTypePriors', () => {
  it('reads the seeded priors', () => {
    expect(PRIORS).toEqual({
      prototypes: {
        sprinter: [3, 2, 1, -1, -2, -3],
        puncheur: [0, 1, 2, 1, -1, -2],
        climber: [-3, -2, -1, 1, 2.5, 2],
        rouleur_tt: [-1, -1, -1, 0, 1.5, 2],
        all_rounder: [0, 0, 0, 0, 0, 0],
      },
      tau: 4,
      sprinterBonus: { score: 0.5, vlamaxMin: 0.6 },
      climberBonus: { score: 0.5, massMaxKg: 55 },
      rouleurTtBonus: { score: 0.5, abs20mPercentileMin: 60 },
    })
  })

  it('names a missing or malformed prior', () => {
    const without = (key: string) => PRIOR_ROWS.filter((row) => row.key !== key)
    const withValue = (key: string, value: unknown) => [...without(key), { key, value }]
    expect(() => parseRiderTypePriors(without('type.softmax_tau'))).toThrow(
      'model_priors type.softmax_tau must be a number',
    )
    expect(() => parseRiderTypePriors(withValue('type.bonus.climber', '0.5'))).toThrow(
      'model_priors type.bonus.climber must be a number',
    )
    expect(() => parseRiderTypePriors(without('type.prototype.climber'))).toThrow(
      'model_priors type.prototype.climber must be 6 numbers',
    )
    expect(() => parseRiderTypePriors(withValue('type.prototype.climber', [1, 2, 3]))).toThrow(
      'model_priors type.prototype.climber must be 6 numbers',
    )
    expect(() =>
      parseRiderTypePriors(withValue('type.prototype.climber', [1, 2, 3, 4, 5, null])),
    ).toThrow('model_priors type.prototype.climber must be 6 numbers')
  })
})

describe('rateAbility', () => {
  it('reproduces the hand-worked climber: type probabilities and CA 13.9', () => {
    const { rows } = rate({ riders: [rider('e')], ratings: erika() })
    expect(rows).toHaveLength(1)
    const row = find(rows, 'e')
    expect(row).toMatchObject({
      athlete_id: 'e',
      as_of: AS_OF,
      set_id: SET_ID,
      primary_type: 'climber',
      type_overridden: false,
      model_version: MODEL_VERSION,
      computed_at: COMPUTED_AT,
    })
    expect(row.type_probs.climber).toBeCloseTo(0.8375, 4)
    expect(row.type_probs.rouleur_tt).toBeCloseTo(0.1582, 4)
    expect(row.type_probs.all_rounder).toBeCloseTo(0.0043, 4)
    expect(row.ca).toBeCloseTo(13.92, 2)
  })

  it('gives a rider with no lab test and no durability a CA', () => {
    const { rows } = rate({ riders: [rider('a')], ratings: power('a', [12, 12, 12, 12, 12, 12]) })
    expect(find(rows, 'a').ca).toBeCloseTo(12, 10)
    expect(find(rows, 'a').primary_type).toBe('all_rounder')
  })

  it('lets the override win: its type, its CA weights at 100%, the computed probabilities kept', () => {
    const computed = find(rate({ riders: [rider('e')], ratings: erika() }).rows, 'e')
    const row = find(
      rate({ riders: [rider('e', { type_override: 'sprinter' })], ratings: erika() }).rows,
      'e',
    )
    expect(row.primary_type).toBe('sprinter')
    expect(row.type_overridden).toBe(true)
    expect(row.type_probs).toEqual(computed.type_probs)
    // Sprinter column: 25·10 + 15·10 + 7.5·11 + 5·15 + 5·14 + 5·14 + 25·14 + 5·15 over 92.5.
    expect(row.ca).toBeCloseTo(1122.5 / 92.5, 10)
  })

  it('writes no row until the rider has all six power ratings', () => {
    const { rows, withoutPowerProfile } = rate({
      riders: [rider('a'), rider('b', { type_override: 'climber' }), rider('c'), rider('d')],
      ratings: [
        ...power('a', [12, 12, 12, 12, 12]), // no 60 min
        ...power('b', [12, 12, 12]), // an override does not replace the ratings
        rated('b', 'vo2max', 15),
        ...power('c', [14, 13, 12, 12, 11, 10]),
      ],
    })
    expect(rows.map((r) => r.athlete_id)).toEqual(['c'])
    expect(withoutPowerProfile).toBe(2) // d has no ratings at all and is not counted
  })

  it('ignores ratings of athletes who are not active riders', () => {
    const { rows, withoutPowerProfile } = rate({
      riders: [rider('a')],
      ratings: [
        ...power('gone', [12, 12, 12, 12, 12, 12]),
        ...power('a', [12, 12, 12, 12, 12, 12]),
      ],
    })
    expect(rows.map((r) => r.athlete_id)).toEqual(['a'])
    expect(withoutPowerProfile).toBe(0)
  })

  it('adds the climber bonus from body mass and the sprinter bonus from VLamax', () => {
    const flat = [12, 12, 12, 12, 12, 12]
    const { rows } = rate({
      riders: [rider('base'), rider('light'), rider('heavy'), rider('fast')],
      ratings: ['base', 'light', 'heavy', 'fast'].flatMap((id) => power(id, flat)),
      bodyMass: { light: 55, heavy: 61 },
      vlamax: { fast: 0.7, heavy: 0.4 },
    })
    const base = find(rows, 'base').type_probs
    expect(find(rows, 'light').type_probs.climber).toBeGreaterThan(base.climber)
    expect(find(rows, 'heavy').type_probs).toEqual(base)
    expect(find(rows, 'fast').type_probs.sprinter).toBeGreaterThan(base.sprinter)
    expect(find(rows, 'fast').type_probs.climber).toBeLessThan(base.climber)
  })

  it('adds the Rouleur/TT bonus from the squad percentile of absolute 20-min power', () => {
    const flat = [12, 12, 12, 12, 12, 12]
    const { rows } = rate({
      riders: [rider('a'), rider('b'), rider('c'), rider('p', { in_squad: false })],
      ratings: [
        ...power('a', flat, 250), // 0th percentile
        ...power('b', flat, 270), // 50th
        ...power('c', flat, 300), // 100th
        ...power('p', flat, 400), // a prospect is not ranked in the squad
      ],
    })
    const none = find(rows, 'a').type_probs
    expect(find(rows, 'b').type_probs).toEqual(none)
    expect(find(rows, 'p').type_probs).toEqual(none)
    expect(find(rows, 'c').type_probs.rouleur_tt).toBeGreaterThan(none.rouleur_tt)
  })

  it('rates the Rouleur/TT share of 20 and 60 min on absolute watts', () => {
    const ratings = power('r', [12, 12, 12, 13, 14.5, 15]).map((r) =>
      r.watts_squad_rating === null ? r : { ...r, watts_squad_rating: 20 },
    )
    const relative = power('r', [12, 12, 12, 13, 14.5, 15])
    const withAbsolute = find(rate({ riders: [rider('r')], ratings }).rows, 'r')
    const same = find(rate({ riders: [rider('r')], ratings: relative }).rows, 'r')
    expect(withAbsolute.primary_type).toBe('rouleur_tt')
    expect(withAbsolute.ca).toBeGreaterThan(same.ca)
  })
})

// In-memory CaStore keyed like rider_ca_pa -------------------------------------------

class FakeCaStore implements CaStore {
  setId: string | null = SET_ID
  riderRows: CaRider[] = []
  ratingRows: RatedAttribute[] = []
  weights: CaWeight[] = WEIGHTS
  priors: PriorRow[] = PRIOR_ROWS
  vlamax = new Map<string, number>()
  mass = new Map<string, number>()
  ca = new Map<string, CaRow>()
  asked: string[] = []

  activeSetId() {
    return Promise.resolve(this.setId)
  }
  riders() {
    return Promise.resolve(this.riderRows)
  }
  ratings(asOf: string, setId: string) {
    this.asked.push(`ratings ${asOf} ${setId}`)
    return Promise.resolve(this.ratingRows)
  }
  caWeights() {
    return Promise.resolve(this.weights)
  }
  riderTypePriors() {
    return Promise.resolve(this.priors)
  }
  latestVlamax(asOf: string) {
    this.asked.push(`vlamax ${asOf}`)
    return Promise.resolve(this.vlamax)
  }
  bodyMass(asOf: string) {
    this.asked.push(`mass ${asOf}`)
    return Promise.resolve(this.mass)
  }
  replaceCa(asOf: string, computedAt: string, rows: CaRow[]) {
    for (const row of rows) this.ca.set(`${row.athlete_id}|${row.as_of}`, row)
    let deleted = 0
    for (const [key, row] of this.ca) {
      if (row.as_of === asOf && row.computed_at < computedAt) {
        this.ca.delete(key)
        deleted++
      }
    }
    return Promise.resolve(deleted)
  }
}

describe('runComputeCa', () => {
  it('types and rates the day and reports what it wrote', async () => {
    const store = new FakeCaStore()
    store.riderRows = [rider('e'), rider('a')]
    store.ratingRows = [...erika(), ...power('a', [12, 12, 12])]
    store.mass.set('e', 54)

    const result = await runComputeCa({ store, asOf: '2026-11-10', now: new Date(COMPUTED_AT) })

    expect(result).toEqual({
      as_of: '2026-11-10',
      set_id: SET_ID,
      riders: 1,
      deleted: 0,
      without_power_profile: 1,
    })
    expect(store.asked.sort()).toEqual([
      'mass 2026-11-10',
      `ratings 2026-11-10 ${SET_ID}`,
      'vlamax 2026-11-10',
    ])
    const row = store.ca.get('e|2026-11-10')
    expect(row?.primary_type).toBe('climber')
    // 54 kg earns the climber bonus: above the 0.837 without it.
    expect(row?.type_probs.climber).toBeCloseTo(0.8538, 4)
  })

  it('replaces the day on a re-run and drops riders who no longer qualify', async () => {
    const store = new FakeCaStore()
    store.riderRows = [rider('e'), rider('a')]
    store.ratingRows = [...erika(), ...power('a', [12, 12, 12, 12, 12, 12])]
    await runComputeCa({ store, asOf: AS_OF, now: new Date('2026-11-12T03:20:00Z') })
    await runComputeCa({ store, asOf: '2026-11-11', now: new Date('2026-11-12T03:21:00Z') })

    store.ratingRows = erika()
    const result = await runComputeCa({ store, asOf: AS_OF, now: new Date('2026-11-12T09:00:00Z') })

    expect(result).toMatchObject({ riders: 1, deleted: 1 })
    expect([...store.ca.keys()].sort()).toEqual(['a|2026-11-11', 'e|2026-11-11', 'e|2026-11-12'])
  })

  it('fails without an active benchmark set and writes nothing', async () => {
    const store = new FakeCaStore()
    store.setId = null
    await expect(runComputeCa({ store, asOf: AS_OF, now: new Date() })).rejects.toThrow(
      'No benchmark set is active',
    )
    expect(store.ca.size).toBe(0)
  })

  it('fails when a rider type has no CA weights', async () => {
    const store = new FakeCaStore()
    store.weights = WEIGHTS.filter((w) => w.riderType !== ('climber' satisfies RiderType))
    await expect(runComputeCa({ store, asOf: AS_OF, now: new Date() })).rejects.toThrow(
      'ca_weights has no rows for climber',
    )
  })

  it('fails on a malformed prior and writes nothing', async () => {
    const store = new FakeCaStore()
    store.riderRows = [rider('e')]
    store.ratingRows = erika()
    store.priors = PRIOR_ROWS.filter((row) => row.key !== 'type.softmax_tau')
    await expect(runComputeCa({ store, asOf: AS_OF, now: new Date() })).rejects.toThrow(
      'model_priors type.softmax_tau must be a number',
    )
    expect(store.ca.size).toBe(0)
  })
})
