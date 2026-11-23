// PA inputs (TODO 7.4, KB §8): the `pa` priors from model_priors and the
// attributes the simulation grows, from the day's rider_ratings. The
// simulation itself is potentialAbility in @prolog/metrics; compute-ca runs
// it right after CA, so both land in the same rider_ca_pa row.

import {
  RIDER_TYPES,
  ratingFromBenchmark,
  squadRatings,
  type Benchmark,
  type PaAttribute,
  type PaPriors,
  type RiderType,
} from '@prolog/metrics'
import type { RatingAttribute } from './ratings.ts'

/** A model_priors row. */
export interface PriorRow {
  key: string
  value: unknown
}

/** How one attribute grows: duration multiplier and cap on total gain (fraction). */
interface Growth {
  multiplier: number
  cap: number
}

export interface PaModel {
  priors: PaPriors
  growth: Readonly<Record<Exclude<RatingAttribute, 'durability'>, Growth>>
  /** Durability: fresh power as 5 and 20 min, post-fatigue power, and the retained % cap. */
  durability: Growth & { post: Growth; maxPct: number }
}

/** A getter for numeric priors; throws when one is missing or not a number. */
export function priorNumbers(rows: readonly PriorRow[]): (key: string) => number {
  const values = new Map(rows.map((row) => [row.key, row.value]))
  return (key) => {
    const value = values.get(key)
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`model_priors ${key} must be a number`)
    }
    return value
  }
}

/** The PA model from its model_priors rows (KB §8); throws when a prior is missing or malformed. */
export function parsePaModel(rows: readonly PriorRow[]): PaModel {
  const number = priorNumbers(rows)
  const pct = (key: string) => number(key) / 100
  const peakAge = Object.fromEntries(
    RIDER_TYPES.map((type) => [type, number(`peak_age.${type}`)]),
  ) as Record<RiderType, number>
  const taper = {
    fullYearsBeforePeak: number('taper.full_years_before_peak'),
    factorAtPeak: number('taper.factor_at_peak'),
    zeroYearsAfterPeak: number('taper.zero_years_after_peak'),
    declineFromAge: number('taper.decline_from_age'),
    declinePctPerYear: number('taper.decline_pct_per_year'),
  }
  // The taper divides by these spans.
  if (!(taper.fullYearsBeforePeak > 0) || !(taper.zeroYearsAfterPeak > 0)) {
    throw new Error('model_priors taper spans must be positive')
  }
  const endurance = pct('cap.p5m_p60m')
  const short = pct('cap.p30s_p1m')
  const growth = {
    p5s: { multiplier: number('multiplier.p5s'), cap: pct('cap.p5s') },
    p30s: { multiplier: number('multiplier.p30s'), cap: short },
    p1m: { multiplier: number('multiplier.p1m'), cap: short },
    p5m: { multiplier: number('multiplier.p5m'), cap: endurance },
    p20m: { multiplier: number('multiplier.p20m'), cap: endurance },
    p60m: { multiplier: number('multiplier.p60m'), cap: endurance },
    vo2max: { multiplier: number('multiplier.vo2max'), cap: pct('cap.vo2max') },
  }
  return {
    priors: {
      peakAge,
      peakAgeNoiseSd: number('peak_age.noise_sd'),
      g0Median: number('gain.g0_median'),
      g0SigmaFactor: number('gain.g0_sigma_factor'),
      gainDecay: number('gain.decay'),
      taper,
      modifiers: {
        vo2maxRatingGap: number('modifier.vo2max_rating_gap'),
        vo2maxBonus: number('modifier.vo2max_bonus'),
        youngTrainingAgeBelow: number('modifier.young_training_age_below'),
        youngCaMin: number('modifier.young_ca_min'),
        youngBonus: number('modifier.young_bonus'),
      },
      draws: number('pa.draws'),
    },
    growth,
    // The durability rating uses 5 and 20 min after work (KB §6), so fresh
    // power grows as the mean of those two durations.
    durability: {
      multiplier: (growth.p5m.multiplier + growth.p20m.multiplier) / 2,
      cap: endurance,
      post: { multiplier: number('multiplier.post_fatigue'), cap: endurance },
      maxPct: number('cap.durability_retained_max'),
    },
  }
}

/** A rider's rating row as PA needs it. */
export interface PaRated {
  athlete_id: string
  attribute: RatingAttribute
  value: number
  rating: number
  confidence: 'high' | 'low'
  watts: number | null
  watts_squad_rating: number | null
}

/**
 * The attributes PA grows for one rider. Values are rated with the active
 * benchmark set; absolute 20/60-min watts, where the rider has a squad rating,
 * are re-rated within the squad against the other squad riders' current watts.
 */
export function paAttributes(input: {
  rated: readonly PaRated[]
  model: PaModel
  benchmarks: ReadonlyMap<string, Benchmark>
  /** Current absolute watts of the other squad riders, per attribute. */
  squadWatts: ReadonlyMap<RatingAttribute, readonly number[]>
}): PaAttribute[] {
  return input.rated.map((r) => {
    const benchmark = input.benchmarks.get(r.attribute)
    if (!benchmark) throw new Error(`No benchmark for ${r.attribute} in the active set`)
    const rate = (value: number) => ratingFromBenchmark(value, benchmark)
    const base = { attribute: r.attribute, value: r.value, confidence: r.confidence, rate }
    if (r.attribute === 'durability') {
      const { post, maxPct, ...fresh } = input.model.durability
      return { ...base, ...fresh, retained: { ...post, maxPct }, absolute: null }
    }
    const others = input.squadWatts.get(r.attribute) ?? []
    const absolute =
      r.watts !== null && r.watts_squad_rating !== null
        ? {
            watts: r.watts,
            // With a squad rating there is at least one other squad value.
            rate: (watts: number) => squadRatings([watts, ...others])[0] ?? Number.NaN,
          }
        : null
    return { ...base, ...input.model.growth[r.attribute], retained: null, absolute }
  })
}
