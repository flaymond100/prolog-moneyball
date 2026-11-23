// Potential Ability (KB §8): the CA a rider is projected to reach at her peak
// age, as P10/P50/P90 of seeded Monte Carlo draws. Every number comes from
// `model_priors`; these functions only apply them.

import { currentAbility, type CaRating, type CaWeight } from './ca.ts'
import { RATING_MAX } from './rating.ts'
import { RIDER_TYPES, type RiderType } from './rider-type.ts'

/** The `pa` rows of `model_priors` that apply to every attribute. */
export interface PaPriors {
  /** Peak age in years per type. */
  peakAge: Readonly<Record<RiderType, number>>
  /** SD of the normal noise on the peak age, per draw. */
  peakAgeNoiseSd: number
  /** Median of the lognormal g0. */
  g0Median: number
  /** Lognormal spread as a factor: σ = ln(factor). */
  g0SigmaFactor: number
  /** Decay per training year: g(t) = g0 · e^(−decay · t). */
  gainDecay: number
  taper: {
    /** Full gain (factor 1) up to peak minus this many years. */
    fullYearsBeforePeak: number
    /** Factor at the peak age, reached linearly from 1. */
    factorAtPeak: number
    /** Factor reaches 0 this many years after the peak. */
    zeroYearsAfterPeak: number
    /** From this age (and once the taper is 0) attributes decline instead. */
    declineFromAge: number
    declinePctPerYear: number
  }
  modifiers: {
    /** Bonus when the lab VO2max rating is at least the 5-min rating plus the gap. */
    vo2maxRatingGap: number
    vo2maxBonus: number
    /** Bonus when training age is below this and CA at least `youngCaMin`. */
    youngTrainingAgeBelow: number
    youngCaMin: number
    youngBonus: number
  }
  draws: number
}

/** One rated attribute, with how it grows and how a projected value is rated. */
export interface PaAttribute {
  attribute: string
  /** Current value in the benchmark unit: W/kg, mL/kg/min or retained %. */
  value: number
  confidence: 'high' | 'low'
  /** Duration multiplier on the annual gain. */
  multiplier: number
  /** Cap on the total gain as a fraction (0.2 = +20%). */
  cap: number
  /** Rating of a value with the active benchmark set. */
  rate: (value: number) => number
  /**
   * Durability: `value` is retained %; fresh power grows by `multiplier` and
   * `cap` above, post-fatigue power by these, and retained % = post ÷ fresh.
   */
  retained: { multiplier: number; cap: number; maxPct: number } | null
  /** Absolute watts rated on their own scale (Rouleur/TT); they grow like the W/kg value. */
  absolute: { watts: number; rate: (watts: number) => number } | null
}

export interface PaInput {
  /** Age in years, with fractions. */
  age: number
  trainingAge: number
  /** The CA type weights: computed probabilities, or 1 for an overridden type. */
  typeProbs: Readonly<Record<RiderType, number>>
  weights: readonly CaWeight[]
  attributes: readonly PaAttribute[]
  /** Current CA, the floor of every PA draw. */
  ca: number
  /** Current ratings for the VO2max modifier. */
  vo2maxRating: number | null
  p5mRating: number | null
  seed: number
}

export interface PaResult {
  p10: number
  p50: number
  p90: number
  /** Median CA one year ahead, without the CA floor and without modifiers. */
  ca12mP50: number
}

// Seed and random numbers ---------------------------------------------------

/** Deterministic 32-bit seed from the rider and day (FNV-1a), so results reproduce. */
export function paSeed(athleteId: string, asOf: string): number {
  const key = `${athleteId}|${asOf}`
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** mulberry32: uniform numbers in [0, 1) from a 32-bit seed. */
function uniform(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Standard normal numbers by Box–Muller. */
function normal(next: () => number): () => number {
  return () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next())
}

/** Quantile with linear interpolation between order statistics; `sorted` is ascending and non-empty. */
function quantile(sorted: readonly number[], p: number): number {
  const position = (sorted.length - 1) * p
  const lo = Math.floor(position)
  // Both indices lie within the array; Number() only satisfies the index type.
  const below = Number(sorted[lo])
  const above = Number(sorted[Math.ceil(position)])
  return below + (above - below) * (position - lo)
}

// Growth --------------------------------------------------------------------

/**
 * Change of an attribute over one year starting at `age` (KB §8), as a fraction:
 * g0 · e^(−decay · training age) · multiplier · age factor. The age factor is 1
 * up to peak − 3, falls linearly to 0.3 at the peak and to 0 at peak + 2. From
 * age 31, once the factor is 0, every attribute declines by 0.75% a year instead.
 */
export function annualChange(
  at: { g0: number; trainingAge: number; age: number; peakAge: number; multiplier: number },
  priors: PaPriors,
): number {
  const { taper } = priors
  const { age, peakAge } = at
  const zeroFrom = peakAge + taper.zeroYearsAfterPeak
  if (age >= taper.declineFromAge && age >= zeroFrom) return -taper.declinePctPerYear / 100
  const fullUntil = peakAge - taper.fullYearsBeforePeak
  let factor = 0
  if (age <= fullUntil) factor = 1
  else if (age <= peakAge) {
    factor = 1 - ((1 - taper.factorAtPeak) * (age - fullUntil)) / taper.fullYearsBeforePeak
  } else if (age < zeroFrom) {
    factor = taper.factorAtPeak * (1 - (age - peakAge) / taper.zeroYearsAfterPeak)
  }
  return at.g0 * Math.exp(-priors.gainDecay * at.trainingAge) * at.multiplier * factor
}

/** Growth factor over `years` (a last part-year counts pro rata), capped at 1 + cap. */
function growth(
  draw: { g0: number; peakAge: number },
  input: PaInput,
  priors: PaPriors,
  years: number,
  multiplier: number,
  cap: number,
): number {
  let factor = 1
  for (let year = 0; year < years; year++) {
    const change = annualChange(
      {
        g0: draw.g0,
        trainingAge: input.trainingAge + year,
        age: input.age + year,
        peakAge: draw.peakAge,
        multiplier,
      },
      priors,
    )
    factor *= 1 + change * Math.min(1, years - year)
  }
  return Math.min(factor, 1 + cap)
}

/** CA of one draw after `years`, from projected values rated with the active set. */
function projectedCa(
  draw: { g0: number; peakAge: number },
  input: PaInput,
  priors: PaPriors,
  years: number,
): number {
  const ratings = input.attributes.map((a): CaRating => {
    const fresh = growth(draw, input, priors, years, a.multiplier, a.cap)
    if (a.retained) {
      const post = growth(draw, input, priors, years, a.retained.multiplier, a.retained.cap)
      // Never above the cap, unless the rider is already there.
      const value = Math.min((a.value * post) / fresh, Math.max(a.retained.maxPct, a.value))
      return {
        attribute: a.attribute,
        rating: a.rate(value),
        absoluteRating: null,
        confidence: a.confidence,
      }
    }
    return {
      attribute: a.attribute,
      rating: a.rate(a.value * fresh),
      absoluteRating: a.absolute ? a.absolute.rate(a.absolute.watts * fresh) : null,
      confidence: a.confidence,
    }
  })
  const ca = currentAbility(input.typeProbs, input.weights, ratings)
  if (ca === null) throw new Error('No CA weight applies to the projected ratings')
  return ca
}

// PA ------------------------------------------------------------------------

/**
 * PA band (KB §8). Each draw samples g0 (lognormal) and the peak age (the
 * type-weighted peak plus normal noise), grows every attribute year by year
 * from now to the peak (at least one year), caps the total gain, rates the
 * projected values, computes CA with the current type weights and adds the
 * modifiers; PA for the draw is at least the current CA. `ca12mP50` runs the
 * same draws one year ahead with neither floor nor modifiers, so declines show.
 */
export function potentialAbility(input: PaInput, priors: PaPriors): PaResult {
  if (!(priors.draws >= 1)) throw new RangeError(`PA needs at least one draw, got ${priors.draws}`)
  const next = uniform(input.seed)
  const z = normal(next)
  const sigma = Math.log(priors.g0SigmaFactor)
  const typicalPeak = RIDER_TYPES.reduce(
    (sum, type) => sum + input.typeProbs[type] * priors.peakAge[type],
    0,
  )

  const { modifiers } = priors
  let bonus = 0
  if (
    input.vo2maxRating !== null &&
    input.p5mRating !== null &&
    input.vo2maxRating >= input.p5mRating + modifiers.vo2maxRatingGap
  ) {
    bonus += modifiers.vo2maxBonus
  }
  if (input.trainingAge < modifiers.youngTrainingAgeBelow && input.ca >= modifiers.youngCaMin) {
    bonus += modifiers.youngBonus
  }

  const pa: number[] = []
  const ahead: number[] = []
  for (let i = 0; i < priors.draws; i++) {
    const draw = {
      g0: priors.g0Median * Math.exp(sigma * z()),
      peakAge: typicalPeak + priors.peakAgeNoiseSd * z(),
    }
    const years = Math.max(1, draw.peakAge - input.age)
    const atPeak = Math.min(RATING_MAX, projectedCa(draw, input, priors, years) + bonus)
    pa.push(Math.max(input.ca, atPeak))
    ahead.push(projectedCa(draw, input, priors, 1))
  }
  pa.sort((a, b) => a - b)
  ahead.sort((a, b) => a - b)
  return {
    p10: quantile(pa, 0.1),
    p50: quantile(pa, 0.5),
    p90: quantile(pa, 0.9),
    ca12mP50: quantile(ahead, 0.5),
  }
}
