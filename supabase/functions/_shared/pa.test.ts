import type { Benchmark } from '@prolog/metrics'
import { describe, expect, it } from 'vitest'
import { paAttributes, parsePaModel, priorNumbers, type PaRated } from './pa.ts'
import { PA_PRIOR_ROWS } from './test-helpers.ts'

const MODEL = parsePaModel(PA_PRIOR_ROWS)

/** Rows without `key`, or with `key` set to `value`. */
const without = (key: string) => PA_PRIOR_ROWS.filter((row) => row.key !== key)
const withValue = (key: string, value: unknown) => [...without(key), { key, value }]

describe('priorNumbers', () => {
  it('reads numbers and names a missing or non-numeric prior', () => {
    const number = priorNumbers([
      { key: 'a', value: 2 },
      { key: 'b', value: '2' },
    ])
    expect(number('a')).toBe(2)
    expect(() => number('b')).toThrow('model_priors b must be a number')
    expect(() => number('c')).toThrow('model_priors c must be a number')
  })
})

describe('parsePaModel', () => {
  it('reads the seeded KB §8 priors, caps as fractions', () => {
    expect(MODEL.priors).toEqual({
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
    })
    expect(MODEL.growth).toEqual({
      p5s: { multiplier: 0.3, cap: 0.08 },
      p30s: { multiplier: 0.5, cap: 0.12 },
      p1m: { multiplier: 0.7, cap: 0.12 },
      p5m: { multiplier: 1, cap: 0.2 },
      p20m: { multiplier: 1, cap: 0.2 },
      p60m: { multiplier: 1.1, cap: 0.2 },
      vo2max: { multiplier: 0.8, cap: 0.1 },
    })
    expect(MODEL.durability).toEqual({
      multiplier: 1,
      cap: 0.2,
      post: { multiplier: 1.3, cap: 0.2 },
      maxPct: 100,
    })
  })

  it('names a missing or malformed prior', () => {
    expect(() => parsePaModel(without('gain.decay'))).toThrow(
      'model_priors gain.decay must be a number',
    )
    expect(() => parsePaModel(withValue('peak_age.climber', null))).toThrow(
      'model_priors peak_age.climber must be a number',
    )
  })

  it('refuses taper spans the taper would divide by zero with', () => {
    expect(() => parsePaModel(withValue('taper.full_years_before_peak', 0))).toThrow(
      'model_priors taper spans must be positive',
    )
    expect(() => parsePaModel(withValue('taper.zero_years_after_peak', 0))).toThrow(
      'model_priors taper spans must be positive',
    )
  })
})

describe('paAttributes', () => {
  // Value v rates v: mean 15, SD 2.5.
  const identity: Benchmark = { method: 'z_score', mean: 15, sd: 2.5 }
  const benchmarks = new Map<string, Benchmark>([
    ['p5s', identity],
    ['p20m', identity],
    ['durability', identity],
  ])
  function row(attribute: PaRated['attribute'], extra: Partial<PaRated> = {}): PaRated {
    return {
      athlete_id: 'a',
      attribute,
      value: 12,
      rating: 12,
      confidence: 'high',
      watts: null,
      watts_squad_rating: null,
      ...extra,
    }
  }

  it('grows power by its duration, durability by post-fatigue over fresh power', () => {
    const [p5s, durability] = paAttributes({
      rated: [row('p5s', { confidence: 'low' }), row('durability')],
      model: MODEL,
      benchmarks,
      squadWatts: new Map(),
    })
    expect(p5s).toMatchObject({
      attribute: 'p5s',
      value: 12,
      confidence: 'low',
      multiplier: 0.3,
      cap: 0.08,
      retained: null,
      absolute: null,
    })
    expect(p5s?.rate(13.5)).toBe(13.5)
    expect(durability).toMatchObject({
      multiplier: 1,
      cap: 0.2,
      retained: { multiplier: 1.3, cap: 0.2, maxPct: 100 },
      absolute: null,
    })
  })

  it('re-rates absolute watts within the squad against the other riders', () => {
    const [p20m] = paAttributes({
      rated: [row('p20m', { watts: 220, watts_squad_rating: 10.5 })],
      model: MODEL,
      benchmarks,
      squadWatts: new Map([['p20m', [200, 240]]]),
    })
    // 220 W sits between 200 and 240 W: the middle of three, 10.5.
    expect(p20m?.absolute?.rate(220)).toBe(10.5)
    expect(p20m?.absolute?.rate(250)).toBe(20)
    expect(p20m?.absolute?.rate(190)).toBe(1)
  })

  it('leaves absolute watts unrated without a squad rating', () => {
    const [prospect] = paAttributes({
      rated: [row('p20m', { watts: 220 })],
      model: MODEL,
      benchmarks,
      squadWatts: new Map(),
    })
    expect(prospect?.absolute).toBeNull()
  })

  it('names an attribute the active set has no benchmark for', () => {
    expect(() =>
      paAttributes({ rated: [row('vo2max')], model: MODEL, benchmarks, squadWatts: new Map() }),
    ).toThrow('No benchmark for vo2max in the active set')
  })
})
