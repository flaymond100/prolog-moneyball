import { describe, expect, it } from 'vitest'
import { caOnFmScale, caStars, currentAbility, type CaRating, type CaWeight } from './ca.ts'
import { RIDER_TYPES, type RiderType } from './rider-type.ts'

describe('caOnFmScale', () => {
  it.each([
    [13.9, 139],
    [14.2, 142],
    [20, 200],
    [1, 10],
    [14.25, 143],
  ])('CA %d → %d', (ca, expected) => {
    expect(caOnFmScale(ca)).toBe(expected)
  })
})

describe('caStars', () => {
  it.each([
    [20, 5],
    [14.2, 3.5], // 3.55 → 3.5
    [13.9, 3.5], // 3.475 → 3.5
    [15, 4], // 3.75 → 4
    [12.9, 3], // 3.225 → 3
    [1, 0.5], // 0.25 → 0.5
  ])('CA %d → %d stars', (ca, expected) => {
    expect(caStars(ca)).toBe(expected)
  })
})

// KB §7 weight matrix in per cent, columns in RIDER_TYPES order.
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

function only(type: RiderType): Record<RiderType, number> {
  return { sprinter: 0, puncheur: 0, climber: 0, rouleur_tt: 0, all_rounder: 0, [type]: 1 }
}

function rated(
  attribute: string,
  rating: number,
  confidence: 'high' | 'low' = 'high',
  absoluteRating: number | null = null,
): CaRating {
  return { attribute, rating, absoluteRating, confidence }
}

describe('currentAbility', () => {
  it('reproduces the hand-worked climber of the mock data (CA 13.9)', () => {
    // Ratings 10, 10, 11 (low), 15, 14, 14, durability 14, VO2max 15; type
    // probabilities from her shape vector. Her absolute ratings equal the W/kg ones.
    const probs = {
      sprinter: 0,
      puncheur: 0.000007,
      climber: 0.837505,
      rouleur_tt: 0.158184,
      all_rounder: 0.004304,
    }
    const ca = currentAbility(probs, WEIGHTS, [
      rated('p5s', 10),
      rated('p30s', 10),
      rated('p1m', 11, 'low'),
      rated('p5m', 15),
      rated('p20m', 14, 'high', 14),
      rated('p60m', 14, 'high', 14),
      rated('durability', 14),
      rated('vo2max', 15),
    ])
    expect(ca).toBeCloseTo(13.92, 2)
  })

  it('is the weighted mean of the ratings for a single type', () => {
    // Sprinter: 25·18 + 15·16 + 15·14 + 5·10 + 5·9 + 5·8 + 25·12 + 5·11 = 1,390 over 100.
    const ca = currentAbility(only('sprinter'), WEIGHTS, [
      rated('p5s', 18),
      rated('p30s', 16),
      rated('p1m', 14),
      rated('p5m', 10),
      rated('p20m', 9),
      rated('p60m', 8),
      rated('durability', 12),
      rated('vo2max', 11),
    ])
    expect(ca).toBeCloseTo(13.9, 12)
  })

  it('blends the weights by type probability', () => {
    // 5 s: sprinter 25, climber 0. 20 min: sprinter 5, climber 25.
    const half = { ...only('sprinter'), sprinter: 0.5, climber: 0.5 }
    const ca = currentAbility(half, WEIGHTS, [rated('p5s', 20), rated('p20m', 10)])
    // w(5 s) = 12.5, w(20 min) = 15 → (12.5·20 + 15·10) ÷ 27.5
    expect(ca).toBeCloseTo(400 / 27.5, 12)
  })

  it('counts a low-confidence attribute at half weight', () => {
    // All-rounder: 5 s 8, 1 min 12.
    const high = currentAbility(only('all_rounder'), WEIGHTS, [rated('p5s', 20), rated('p1m', 10)])
    const low = currentAbility(only('all_rounder'), WEIGHTS, [
      rated('p5s', 20, 'low'),
      rated('p1m', 10),
    ])
    expect(high).toBeCloseTo((8 * 20 + 12 * 10) / 20, 12)
    expect(low).toBeCloseTo((4 * 20 + 12 * 10) / 16, 12)
  })

  it('drops a missing attribute and renormalises: no lab test, still a CA', () => {
    const power = ['p5s', 'p30s', 'p1m', 'p5m', 'p20m', 'p60m'].map((a) => rated(a, 12))
    const withLab = currentAbility(only('climber'), WEIGHTS, [...power, rated('vo2max', 18)])
    const withoutLab = currentAbility(only('climber'), WEIGHTS, power)
    expect(withoutLab).toBeCloseTo(12, 12)
    // Climber power weights sum to 70, VO2max 5: (70·12 + 5·18) ÷ 75.
    expect(withLab).toBeCloseTo(930 / 75, 12)
  })

  it('rates Rouleur/TT 20 and 60 min on absolute watts', () => {
    const ratings = [rated('p5m', 12), rated('p20m', 10, 'high', 18), rated('p60m', 10, 'high', 16)]
    // Rouleur/TT: 5 min 10, 20 min 25, 60 min 20, on the absolute ratings.
    expect(currentAbility(only('rouleur_tt'), WEIGHTS, ratings)).toBeCloseTo(
      (10 * 12 + 25 * 18 + 20 * 16) / 55,
      12,
    )
    // Climber: 5 min 20, 20 min 25, 60 min 15, on the W/kg ratings.
    expect(currentAbility(only('climber'), WEIGHTS, ratings)).toBeCloseTo(
      (20 * 12 + 25 * 10 + 15 * 10) / 60,
      12,
    )
    // Half each: every share goes to its own rating.
    const half = { ...only('climber'), climber: 0.5, rouleur_tt: 0.5 }
    expect(currentAbility(half, WEIGHTS, ratings)).toBeCloseTo(
      (15 * 12 + 12.5 * 10 + 12.5 * 18 + 7.5 * 10 + 10 * 16) / 57.5,
      12,
    )
  })

  it('drops the absolute share when there is no absolute rating', () => {
    const ca = currentAbility(only('rouleur_tt'), WEIGHTS, [rated('p5m', 12), rated('p20m', 10)])
    expect(ca).toBeCloseTo(12, 12)
  })

  it('is null when no rated attribute carries weight', () => {
    expect(currentAbility(only('climber'), WEIGHTS, [])).toBeNull()
    // The climber weight for 5 s is 0.
    expect(currentAbility(only('climber'), WEIGHTS, [rated('p5s', 15)])).toBeNull()
    expect(currentAbility(only('climber'), [], [rated('p5m', 15)])).toBeNull()
  })

  it('stays within the range of the ratings', () => {
    const ratings = Object.keys(MATRIX).map((a, i) => rated(a, 8 + i, i % 2 ? 'low' : 'high', 9))
    for (const type of RIDER_TYPES) {
      const ca = currentAbility(only(type), WEIGHTS, ratings)
      expect(ca).toBeGreaterThanOrEqual(8)
      expect(ca).toBeLessThanOrEqual(15)
    }
  })
})
