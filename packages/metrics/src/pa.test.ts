import { describe, expect, it } from 'vitest'
import type { CaWeight } from './ca.ts'
import {
  annualChange,
  paSeed,
  potentialAbility,
  type PaAttribute,
  type PaInput,
  type PaPriors,
} from './pa.ts'
import { ratingFromZ } from './rating.ts'
import { RIDER_TYPES, type RiderType } from './rider-type.ts'

// KB §8 v1 priors, as seeded in model_priors.
const PRIORS: PaPriors = {
  peakAge: { sprinter: 28.7, puncheur: 27.5, climber: 27, rouleur_tt: 28.5, all_rounder: 27 },
  peakAgeNoiseSd: 1.5,
  g0Median: 0.1,
  g0SigmaFactor: 1.5,
  gainDecay: 0.35,
  taper: {
    fullYearsBeforePeak: 3,
    factorAtPeak: 0.3,
    zeroYearsAfterPeak: 2,
    declineFromAge: 31,
    declinePctPerYear: 0.75,
  },
  modifiers: {
    vo2maxRatingGap: 2,
    vo2maxBonus: 0.5,
    youngTrainingAgeBelow: 3,
    youngCaMin: 13,
    youngBonus: 0.5,
  },
  draws: 1000,
}
/** No spread: every draw is the median g0 at the typical peak age. */
const FIXED: PaPriors = { ...PRIORS, peakAgeNoiseSd: 0, g0SigmaFactor: 1 }

// KB §7 CA weights, columns in RIDER_TYPES order.
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
/** Every type weighs 5-min power only, so CA is its rating. */
const P5M_ONLY: CaWeight[] = RIDER_TYPES.map((riderType) => ({
  riderType,
  attribute: 'p5m',
  weight: 100,
  absoluteWatts: false,
}))

/** A rating scale on which value 1 rates `rating` and +10% adds 2.5 points. */
function scale(rating: number): (value: number) => number {
  return (value) => ratingFromZ(value, 1 - ((rating - 15) * 0.1) / 2.5, 0.1)
}

/** KB §8 duration multipliers and caps. */
const GROWTH: Record<string, { multiplier: number; cap: number }> = {
  p5s: { multiplier: 0.3, cap: 0.08 },
  p30s: { multiplier: 0.5, cap: 0.12 },
  p1m: { multiplier: 0.7, cap: 0.12 },
  p5m: { multiplier: 1, cap: 0.2 },
  p20m: { multiplier: 1, cap: 0.2 },
  p60m: { multiplier: 1.1, cap: 0.2 },
  vo2max: { multiplier: 0.8, cap: 0.1 },
}

function attribute(name: string, rating: number, extra: Partial<PaAttribute> = {}): PaAttribute {
  const growth = GROWTH[name] ?? { multiplier: 1, cap: 0.2 }
  return {
    attribute: name,
    value: 1,
    confidence: 'high',
    ...growth,
    rate: scale(rating),
    retained: null,
    absolute: null,
    ...extra,
  }
}

/** Durability at `pct` retained, rated so that `pct` rates `rating` and each point adds 0.025. */
function durability(pct: number, rating: number, extra: Partial<PaAttribute['retained']> = {}) {
  return attribute('durability', rating, {
    value: pct,
    rate: (value) => ratingFromZ(value, pct - (rating - 15) * 40, 100),
    retained: { multiplier: 1.3, cap: 0.2, maxPct: 100, ...extra },
  })
}

const ONLY_ALL_ROUNDER: Record<RiderType, number> = {
  sprinter: 0,
  puncheur: 0,
  climber: 0,
  rouleur_tt: 0,
  all_rounder: 1,
}

/** A rider rated 10 on everything, all-rounder, age 22, training age 2. */
function input(extra: Partial<PaInput> = {}): PaInput {
  return {
    age: 22,
    trainingAge: 2,
    typeProbs: ONLY_ALL_ROUNDER,
    weights: WEIGHTS,
    attributes: [
      ...['p5s', 'p30s', 'p1m', 'p5m', 'p20m', 'p60m', 'vo2max'].map((name) => attribute(name, 10)),
      durability(85, 10),
    ],
    ca: 10,
    vo2maxRating: null,
    p5mRating: null,
    seed: 42,
    ...extra,
  }
}

describe('paSeed', () => {
  it('is the same for the same rider and day, and differs otherwise', () => {
    const seed = paSeed('i123', '2026-11-23')
    expect(paSeed('i123', '2026-11-23')).toBe(seed)
    expect(paSeed('i124', '2026-11-23')).not.toBe(seed)
    expect(paSeed('i123', '2026-11-24')).not.toBe(seed)
    expect(Number.isInteger(seed)).toBe(true)
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThan(2 ** 32)
  })
})

describe('annualChange', () => {
  const at = { g0: 0.1, age: 20, peakAge: 27, multiplier: 1 }

  it('reproduces the KB §8 expected gains for 5–20 min power', () => {
    const gain = (trainingAge: number) => annualChange({ ...at, trainingAge }, PRIORS)
    expect(gain(1)).toBeCloseTo(0.0705, 4)
    expect(gain(2)).toBeCloseTo(0.0497, 4)
    expect(gain(3)).toBeCloseTo(0.035, 4)
    expect(gain(4)).toBeCloseTo(0.0247, 4)
    expect(gain(6)).toBeCloseTo(0.0122, 4)
    expect(gain(8)).toBeLessThanOrEqual(0.0061)
  })

  it('scales with the duration multiplier', () => {
    expect(annualChange({ ...at, trainingAge: 1, multiplier: 0.3 }, PRIORS)).toBeCloseTo(
      0.3 * 0.0705,
      4,
    )
  })

  it('tapers from peak − 3 to 0.3 at the peak and 0 at peak + 2', () => {
    const factor = (age: number, peakAge = 27) =>
      annualChange({ ...at, age, peakAge, trainingAge: 0 }, PRIORS) / 0.1
    expect(factor(24)).toBeCloseTo(1, 10)
    expect(factor(25.5)).toBeCloseTo(0.65, 10)
    expect(factor(27)).toBeCloseTo(0.3, 10)
    expect(factor(28)).toBeCloseTo(0.15, 10)
    expect(factor(29)).toBe(0)
    expect(factor(30)).toBe(0)
  })

  it('declines 0.75% a year from 31 once the taper is over', () => {
    expect(annualChange({ ...at, age: 31, trainingAge: 0 }, PRIORS)).toBeCloseTo(-0.0075, 10)
    expect(annualChange({ ...at, age: 35, trainingAge: 10 }, PRIORS)).toBeCloseTo(-0.0075, 10)
    // A late peak: still tapering at 31, so no decline yet.
    expect(annualChange({ ...at, age: 31, peakAge: 30, trainingAge: 0 }, PRIORS)).toBeCloseTo(
      0.1 * 0.15,
      10,
    )
  })
})

describe('potentialAbility', () => {
  it('reproduces a hand-worked part-year projection', () => {
    // Age 25.5, peak 27: 1.5 years. Year 1: training age 1, taper 0.65 → +4.5805%.
    // Half of year 2: training age 2, taper 0.41667 → +2.0691% × 0.5. Growth 1.056624.
    const result = potentialAbility(
      input({ age: 25.5, trainingAge: 1, weights: P5M_ONLY, attributes: [attribute('p5m', 10)] }),
      FIXED,
    )
    expect(result.p10).toBeCloseTo(10 + 25 * 0.056624, 4)
    expect(result.p50).toBe(result.p10)
    expect(result.p90).toBe(result.p10)
    expect(result.ca12mP50).toBeCloseTo(10 + 25 * 0.045805, 4)
  })

  it('gives the same result for the same seed and a different one for another', () => {
    const first = potentialAbility(input(), PRIORS)
    expect(potentialAbility(input(), PRIORS)).toEqual(first)
    expect(potentialAbility(input({ seed: 43 }), PRIORS)).not.toEqual(first)
  })

  it('never puts PA below CA, and orders the band', () => {
    for (const age of [17, 21, 25, 28, 31, 35]) {
      for (const trainingAge of [0, 2, 5, 10]) {
        for (const ca of [4, 10, 16]) {
          const result = potentialAbility(
            input({ age, trainingAge, ca, seed: age * trainingAge }),
            {
              ...PRIORS,
              draws: 200,
            },
          )
          expect(result.p10).toBeGreaterThanOrEqual(ca)
          expect(result.p10).toBeLessThanOrEqual(result.p50)
          expect(result.p50).toBeLessThanOrEqual(result.p90)
          expect(result.p90).toBeLessThanOrEqual(20)
        }
      }
    }
  })

  it('widens the band as training age falls', () => {
    // Age 26, a year before the peak, so the caps on total gain do not bind.
    const width = (trainingAge: number) => {
      const { p10, p90 } = potentialAbility(input({ age: 26, trainingAge }), PRIORS)
      return p90 - p10
    }
    expect(width(0)).toBeGreaterThan(width(1))
    expect(width(1)).toBeGreaterThan(width(3))
    expect(width(3)).toBeGreaterThan(width(6))
    expect(width(6)).toBeGreaterThan(width(10))
  })

  it('narrows the band again once most draws reach the caps', () => {
    // KB §8 as written: at age 22 with training age 0, nearly every draw hits the caps.
    const width = (trainingAge: number) => {
      const { p10, p90 } = potentialAbility(input({ trainingAge }), PRIORS)
      return p90 - p10
    }
    expect(width(0)).toBeLessThan(width(3))
  })

  it('gives a rider older than peak + 2 PA equal to CA, and a 12-month decline', () => {
    const result = potentialAbility(input({ age: 36, trainingAge: 15 }), PRIORS)
    expect(result.p10).toBe(10)
    expect(result.p90).toBe(10)
    expect(result.ca12mP50).toBeLessThan(10)
  })

  it('projects a 12-month gain for a young rider, without the CA floor', () => {
    expect(potentialAbility(input(), PRIORS).ca12mP50).toBeGreaterThan(10)
  })

  it('adds the VO2max modifier when lab VO2max rates 2 above 5-min power', () => {
    // Age 36: one year of decline, so PA = 12-month CA + modifiers when that beats CA.
    const old = { age: 36, trainingAge: 15 }
    const gap = potentialAbility(input({ ...old, vo2maxRating: 12, p5mRating: 10 }), FIXED)
    expect(gap.p50).toBeCloseTo(gap.ca12mP50 + 0.5, 10)
    const below = potentialAbility(input({ ...old, vo2maxRating: 11.9, p5mRating: 10 }), FIXED)
    expect(below.p50).toBe(10)
    const noLab = potentialAbility(input({ ...old, vo2maxRating: null, p5mRating: 10 }), FIXED)
    expect(noLab.p50).toBe(10)
    const noPower = potentialAbility(input({ ...old, vo2maxRating: 12, p5mRating: null }), FIXED)
    expect(noPower.p50).toBe(10)
  })

  it('adds the young modifier below training age 3 with CA at least 13', () => {
    const at = (trainingAge: number, ca: number) =>
      potentialAbility(
        input({ age: 36, trainingAge, ca, weights: P5M_ONLY, attributes: [attribute('p5m', ca)] }),
        FIXED,
      )
    const young = at(2.9, 13)
    expect(young.p50).toBeCloseTo(young.ca12mP50 + 0.5, 10)
    expect(at(3, 13).p50).toBe(13)
    expect(at(2.9, 12.9).p50).toBe(12.9)
  })

  it('stacks both modifiers, but never above 20', () => {
    const both = potentialAbility(
      input({
        age: 36,
        trainingAge: 1,
        ca: 14,
        vo2maxRating: 18,
        p5mRating: 14,
        weights: P5M_ONLY,
        attributes: [attribute('p5m', 14)],
      }),
      FIXED,
    )
    expect(both.p50).toBeCloseTo(both.ca12mP50 + 1, 10)
    const top = potentialAbility(
      input({ ca: 19.8, trainingAge: 1, weights: P5M_ONLY, attributes: [attribute('p5m', 19.8)] }),
      PRIORS,
    )
    expect(top.p90).toBe(20)
  })

  it('caps the total gain per attribute', () => {
    // A huge g0 hits every cap: 5 s +8%, 30 s and 1 min +12%, 5–60 min +20%, VO2max +10%.
    const huge = { ...FIXED, g0Median: 5 }
    const rated = (name: string) =>
      potentialAbility(
        input({
          age: 18,
          trainingAge: 0,
          weights: [
            { riderType: 'all_rounder', attribute: name, weight: 100, absoluteWatts: false },
          ],
        }),
        huge,
      ).p50
    expect(rated('p5s')).toBeCloseTo(10 + 25 * 0.08, 10)
    expect(rated('p30s')).toBeCloseTo(10 + 25 * 0.12, 10)
    expect(rated('p1m')).toBeCloseTo(10 + 25 * 0.12, 10)
    expect(rated('p5m')).toBeCloseTo(15, 10)
    expect(rated('p60m')).toBeCloseTo(15, 10)
    expect(rated('vo2max')).toBeCloseTo(10 + 25 * 0.1, 10)
  })

  it('grows durability by post-fatigue over fresh power, never above 100% retained', () => {
    const only = (a: PaAttribute, priors: PaPriors = FIXED) =>
      potentialAbility(
        input({
          trainingAge: 4,
          weights: [
            {
              riderType: 'all_rounder',
              attribute: 'durability',
              weight: 100,
              absoluteWatts: false,
            },
          ],
          attributes: [a],
        }),
        priors,
      ).ca12mP50
    // Age 22, training age 4: fresh +2.4664%, post-fatigue +1.3 × that.
    const g = 0.1 * Math.exp(-0.35 * 4)
    const retained = (85 * (1 + 1.3 * g)) / (1 + g)
    expect(only(durability(85, 10))).toBeCloseTo(10 + (retained - 85) / 40, 10)
    // Both capped at +20%: retained % stays.
    expect(only(durability(85, 10), { ...FIXED, g0Median: 5 })).toBeCloseTo(10, 10)
    // Fresh power capped at 0, post-fatigue at +20%: 95% would become 114%, held at 100%.
    expect(only({ ...durability(95, 10), cap: 0 }, { ...FIXED, g0Median: 5 })).toBeCloseTo(
      10 + (100 - 95) / 40,
      10,
    )
    // Already above 100%: kept, not cut.
    expect(only({ ...durability(102, 10), cap: 0 }, { ...FIXED, g0Median: 5 })).toBeCloseTo(10, 10)
  })

  it('grows absolute watts like the W/kg value and rates them on their own scale', () => {
    const rouleur = { ...ONLY_ALL_ROUNDER, all_rounder: 0, rouleur_tt: 1 }
    const result = potentialAbility(
      input({
        age: 18,
        trainingAge: 0,
        typeProbs: rouleur,
        weights: [{ riderType: 'rouleur_tt', attribute: 'p20m', weight: 100, absoluteWatts: true }],
        attributes: [attribute('p20m', 10, { absolute: { watts: 200, rate: (w) => w / 20 } })],
      }),
      { ...FIXED, g0Median: 5 },
    )
    // 200 W × 1.2 = 240 W, rated 12; the W/kg rating does not count for this type.
    expect(result.p50).toBeCloseTo(12, 10)
  })

  it('peaks at the type-weighted peak age', () => {
    // Half sprinter (28.7), half climber (27.0): peak 27.85. Age 26.85: exactly one year.
    const mixed = { ...ONLY_ALL_ROUNDER, all_rounder: 0, sprinter: 0.5, climber: 0.5 }
    const result = potentialAbility(
      input({
        age: 26.85,
        trainingAge: 0,
        typeProbs: mixed,
        weights: P5M_ONLY,
        attributes: [attribute('p5m', 10)],
      }),
      FIXED,
    )
    expect(result.p50).toBeCloseTo(result.ca12mP50, 10)
    expect(result.p50).toBeCloseTo(10 + 25 * 0.1 * (1 - (0.7 * 2) / 3), 10)
  })

  it('refuses fewer than one draw and ratings no weight applies to', () => {
    expect(() => potentialAbility(input(), { ...PRIORS, draws: 0 })).toThrow(RangeError)
    expect(() => potentialAbility(input({ weights: [] }), PRIORS)).toThrow(
      'No CA weight applies to the projected ratings',
    )
  })
})
