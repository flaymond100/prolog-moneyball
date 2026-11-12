import { describe, expect, it } from 'vitest'
import {
  RIDER_TYPES,
  primaryRiderType,
  riderTypeProbs,
  shapeVector,
  type RiderType,
  type RiderTypeInput,
  type RiderTypePriors,
} from './rider-type.ts'

// KB §7 priors, as seeded in model_priors.
const PRIORS: RiderTypePriors = {
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
}

// Synthetic riders: ratings for 5 s, 30 s, 1 min, 5 min, 20 min, 60 min.
const SPRINTER = [17, 16, 15, 11, 10, 9]
const PUNCHEUR = [13, 14, 15, 14, 12, 11]
const CLIMBER = [9, 10, 11, 14, 15.5, 15]
const ROULEUR = [12, 12, 12, 13, 14.5, 15]
const FLAT = [12, 12, 12, 12, 12, 12]

function probs(powerRatings: number[], extra: Partial<RiderTypeInput> = {}, priors = PRIORS) {
  return riderTypeProbs(
    { powerRatings, vlamax: null, bodyMassKg: null, abs20mSquadPercentile: null, ...extra },
    priors,
  )
}

function total(p: Record<RiderType, number>): number {
  return RIDER_TYPES.reduce((sum, type) => sum + p[type], 0)
}

describe('shapeVector', () => {
  it('subtracts the rider’s own mean rating', () => {
    expect(shapeVector(SPRINTER)).toEqual([4, 3, 2, -2, -3, -4])
    expect(shapeVector(FLAT)).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('needs all six power ratings', () => {
    expect(() => shapeVector([17, 16, 15, 11, 10])).toThrow(RangeError)
    expect(() => shapeVector([])).toThrow(RangeError)
  })
})

describe('riderTypeProbs', () => {
  it('matches a hand-calculated flat profile', () => {
    // Shape 0,0,0,0,0,0, so each score is −(sum of squared prototype values):
    // sprinter −28, puncheur −11, climber −25.25, Rouleur/TT −9.25, all-rounder 0.
    const weights = [-28, -11, -25.25, -9.25, 0].map((score) => Math.exp(score / 4))
    const sum = weights.reduce((a, b) => a + b, 0)
    const p = probs(FLAT)
    expect(p.sprinter).toBeCloseTo((weights[0] ?? NaN) / sum, 12)
    expect(p.puncheur).toBeCloseTo((weights[1] ?? NaN) / sum, 12)
    expect(p.climber).toBeCloseTo((weights[2] ?? NaN) / sum, 12)
    expect(p.rouleur_tt).toBeCloseTo((weights[3] ?? NaN) / sum, 12)
    expect(p.all_rounder).toBeCloseTo((weights[4] ?? NaN) / sum, 12)
    expect(p.all_rounder).toBeGreaterThan(0.85)
  })

  it('classifies synthetic sprinter, puncheur, climber and rouleur fixtures', () => {
    const fixtures: [number[], RiderType][] = [
      [SPRINTER, 'sprinter'],
      [PUNCHEUR, 'puncheur'],
      [CLIMBER, 'climber'],
      [ROULEUR, 'rouleur_tt'],
      [FLAT, 'all_rounder'],
    ]
    for (const [ratings, expected] of fixtures) {
      const p = probs(ratings)
      expect(primaryRiderType(p, null)).toEqual({ type: expected, overridden: false })
      expect(p[expected]).toBeGreaterThan(0.6)
      expect(total(p)).toBeCloseTo(1, 12)
    }
  })

  it('depends on the shape of the profile, not its level', () => {
    const strong = probs(SPRINTER)
    const weak = probs(SPRINTER.map((r) => r - 6))
    for (const type of RIDER_TYPES) expect(weak[type]).toBeCloseTo(strong[type], 12)
  })

  // A bonus of 0.5 on a score multiplies that type's odds by e^(0.5 ÷ τ).
  const oddsGain = Math.exp(0.5 / 4)
  const odds = (p: Record<RiderType, number>, type: RiderType) => p[type] / p.all_rounder

  it('adds the sprinter bonus from VLamax 0.6 mmol/L/s', () => {
    const base = probs(FLAT)
    expect(odds(probs(FLAT, { vlamax: 0.6 }), 'sprinter')).toBeCloseTo(
      odds(base, 'sprinter') * oddsGain,
      12,
    )
    expect(probs(FLAT, { vlamax: 0.59 })).toEqual(base)
  })

  it('adds the climber bonus up to 55 kg body mass', () => {
    const base = probs(FLAT)
    expect(odds(probs(FLAT, { bodyMassKg: 55 }), 'climber')).toBeCloseTo(
      odds(base, 'climber') * oddsGain,
      12,
    )
    expect(probs(FLAT, { bodyMassKg: 55.1 })).toEqual(base)
  })

  it('adds the Rouleur/TT bonus from the squad’s 60th percentile of absolute 20-min power', () => {
    const base = probs(FLAT)
    expect(odds(probs(FLAT, { abs20mSquadPercentile: 60 }), 'rouleur_tt')).toBeCloseTo(
      odds(base, 'rouleur_tt') * oddsGain,
      12,
    )
    expect(probs(FLAT, { abs20mSquadPercentile: 59.9 })).toEqual(base)
  })

  it('applies each bonus to its own type only', () => {
    const base = probs(FLAT)
    const all = probs(FLAT, { vlamax: 0.9, bodyMassKg: 50, abs20mSquadPercentile: 100 })
    expect(odds(all, 'puncheur')).toBeCloseTo(odds(base, 'puncheur'), 12)
    for (const type of ['sprinter', 'climber', 'rouleur_tt'] as const) {
      expect(odds(all, type)).toBeCloseTo(odds(base, type) * oddsGain, 12)
    }
  })

  it('reads prototypes, bonuses and τ from the priors', () => {
    const flatter = probs(SPRINTER, {}, { ...PRIORS, tau: 40 })
    expect(flatter.sprinter).toBeLessThan(probs(SPRINTER).sprinter)
    expect(primaryRiderType(flatter, null).type).toBe('sprinter')

    const swapped = probs(
      SPRINTER,
      {},
      {
        ...PRIORS,
        prototypes: {
          ...PRIORS.prototypes,
          sprinter: PRIORS.prototypes.climber,
          climber: PRIORS.prototypes.sprinter,
        },
      },
    )
    expect(primaryRiderType(swapped, null).type).toBe('climber')
  })

  it('stays finite for an extreme profile and a small τ', () => {
    const p = probs([20, 20, 20, 1, 1, 1], {}, { ...PRIORS, tau: 0.01 })
    expect(total(p)).toBeCloseTo(1, 12)
    expect(p.sprinter).toBeCloseTo(1, 12)
  })

  it('refuses a τ that is not positive', () => {
    expect(() => probs(FLAT, {}, { ...PRIORS, tau: 0 })).toThrow(RangeError)
    expect(() => probs(FLAT, {}, { ...PRIORS, tau: Number.NaN })).toThrow(RangeError)
  })

  it('refuses a prototype without exactly six values', () => {
    const withClimber = (climber: number[]) => ({
      ...PRIORS,
      prototypes: { ...PRIORS.prototypes, climber },
    })
    expect(() => probs(FLAT, {}, withClimber([-3, -2, -1, 1, 2.5]))).toThrow(RangeError)
    expect(() => probs(FLAT, {}, withClimber([-3, -2, -1, 1, 2.5, 2, 0]))).toThrow(RangeError)
  })

  it('needs all six power ratings', () => {
    expect(() => probs([17, 16, 15])).toThrow(RangeError)
  })
})

describe('primaryRiderType', () => {
  const sprinterProbs = probs(SPRINTER)

  it('is the most likely type', () => {
    expect(primaryRiderType(sprinterProbs, null)).toEqual({ type: 'sprinter', overridden: false })
  })

  it('lets the manual override win', () => {
    expect(primaryRiderType(sprinterProbs, 'climber')).toEqual({
      type: 'climber',
      overridden: true,
    })
    expect(primaryRiderType(sprinterProbs, 'sprinter')).toEqual({
      type: 'sprinter',
      overridden: true,
    })
  })

  it('takes the earlier type in KB order on a tie', () => {
    const tied = { sprinter: 0.1, puncheur: 0.3, climber: 0.3, rouleur_tt: 0.2, all_rounder: 0.1 }
    expect(primaryRiderType(tied, null).type).toBe('puncheur')
  })
})
