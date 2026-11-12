// compute-ca (TODO 7.2, 7.3, KB §7): rider type and Current Ability from the
// day's rider_ratings, written to rider_ca_pa.
//
// The formulas live in @prolog/metrics; this file only gathers their inputs.
// Storage sits behind CaStore, so there is no IO here.

import {
  RIDER_TYPES,
  SHAPE_LENGTH,
  currentAbility,
  primaryRiderType,
  riderTypeProbs,
  squadPercentiles,
  type CaWeight,
  type RiderType,
  type RiderTypePriors,
} from '@prolog/metrics'
import type { Confidence, RatingAttribute } from './ratings.ts'

/** Stored with every row; raise it when the type or CA model changes. */
export const MODEL_VERSION = 'v1'

/** The shape vector's attributes, in its order (KB §7). */
const POWER_ATTRIBUTES: readonly RatingAttribute[] = ['p5s', 'p30s', 'p1m', 'p5m', 'p20m', 'p60m']
const ABSOLUTE_20_MIN: RatingAttribute = 'p20m'

// Inputs --------------------------------------------------------------------

/** An active athlete with her profile's cohort and type override. */
export interface CaRider {
  athlete_id: string
  in_squad: boolean
  type_override: RiderType | null
}
/** A rider_ratings row of the day and set. */
export interface RatedAttribute {
  athlete_id: string
  attribute: RatingAttribute
  rating: number
  confidence: Confidence
  watts: number | null
  watts_squad_rating: number | null
}
/** A model_priors row. */
export interface PriorRow {
  key: string
  value: unknown
}

// Output --------------------------------------------------------------------

/** The type and CA columns of a rider_ca_pa row; PA is added by its own job (TODO 7.4). */
export interface CaRow {
  athlete_id: string
  as_of: string
  set_id: string
  ca: number
  primary_type: RiderType
  type_overridden: boolean
  type_probs: Record<RiderType, number>
  model_version: string
  computed_at: string
}

export interface CaStore {
  /** Id of the active benchmark set, or null when none is active. */
  activeSetId(): Promise<string | null>
  riders(): Promise<CaRider[]>
  ratings(asOf: string, setId: string): Promise<RatedAttribute[]>
  caWeights(): Promise<CaWeight[]>
  /** The `rider_type` rows of model_priors. */
  riderTypePriors(): Promise<PriorRow[]>
  /** Latest lab VLamax (mmol/L/s) per rider on or before the day. */
  latestVlamax(asOf: string): Promise<Map<string, number>>
  /** Latest body mass (kg) per rider on or before the day. */
  bodyMass(asOf: string): Promise<Map<string, number>>
  /**
   * Upserts the rows, then deletes the day's other rows (those computed
   * before `computedAt`); returns how many it deleted.
   */
  replaceCa(asOf: string, computedAt: string, rows: CaRow[]): Promise<number>
}

export interface CaResult {
  as_of: string
  set_id: string
  riders: number
  deleted: number
  /** Rated riders left without type and CA: not all six power ratings yet. */
  without_power_profile: number
}

// Priors --------------------------------------------------------------------

/** The rider-type priors from their model_priors rows; throws when one is missing or malformed. */
export function parseRiderTypePriors(rows: readonly PriorRow[]): RiderTypePriors {
  const values = new Map(rows.map((row) => [row.key, row.value]))
  const number = (key: string): number => {
    const value = values.get(key)
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`model_priors ${key} must be a number`)
    }
    return value
  }
  const prototype = (type: RiderType): number[] => {
    const key = `type.prototype.${type}`
    const value = values.get(key)
    if (
      !Array.isArray(value) ||
      value.length !== SHAPE_LENGTH ||
      !value.every((v): v is number => typeof v === 'number' && Number.isFinite(v))
    ) {
      throw new Error(`model_priors ${key} must be ${SHAPE_LENGTH} numbers`)
    }
    return value
  }
  return {
    prototypes: {
      sprinter: prototype('sprinter'),
      puncheur: prototype('puncheur'),
      climber: prototype('climber'),
      rouleur_tt: prototype('rouleur_tt'),
      all_rounder: prototype('all_rounder'),
    },
    tau: number('type.softmax_tau'),
    sprinterBonus: {
      score: number('type.bonus.sprinter'),
      vlamaxMin: number('type.bonus.sprinter_vlamax_min'),
    },
    climberBonus: {
      score: number('type.bonus.climber'),
      massMaxKg: number('type.bonus.climber_mass_max'),
    },
    rouleurTtBonus: {
      score: number('type.bonus.rouleur_tt'),
      abs20mPercentileMin: number('type.bonus.rouleur_tt_abs20_percentile_min'),
    },
  }
}

// Type and CA ---------------------------------------------------------------

/** Probability 1 for one type: a manual override takes all the CA weight. */
function only(type: RiderType): Record<RiderType, number> {
  return { sprinter: 0, puncheur: 0, climber: 0, rouleur_tt: 0, all_rounder: 0, [type]: 1 }
}

/**
 * rider_ca_pa rows for one day. A rider gets a type and CA once she has all
 * six power ratings (agreed with Kosta, 12 November 2026). A manual override
 * sets the primary type and takes that type's CA weights at 100%; type_probs
 * stay as computed.
 */
export function rateAbility(input: {
  asOf: string
  setId: string
  computedAt: string
  riders: readonly CaRider[]
  ratings: readonly RatedAttribute[]
  weights: readonly CaWeight[]
  priors: RiderTypePriors
  vlamax: ReadonlyMap<string, number>
  bodyMass: ReadonlyMap<string, number>
}): { rows: CaRow[]; withoutPowerProfile: number } {
  const byRider = new Map<string, RatedAttribute[]>()
  for (const rated of input.ratings) {
    const own = byRider.get(rated.athlete_id)
    if (own) own.push(rated)
    else byRider.set(rated.athlete_id, [rated])
  }

  // Squad percentile of absolute 20-min power, for the Rouleur/TT bonus.
  const squad = input.riders.filter((rider) => rider.in_squad)
  const abs20m = (athleteId: string): number | null =>
    byRider.get(athleteId)?.find((r) => r.attribute === ABSOLUTE_20_MIN)?.watts ?? null
  const percentiles = squadPercentiles(squad.map((rider) => abs20m(rider.athlete_id)))
  const abs20mPercentile = new Map(squad.map((rider, i) => [rider.athlete_id, percentiles[i]]))

  const rows: CaRow[] = []
  let withoutPowerProfile = 0
  for (const rider of input.riders) {
    const rated = byRider.get(rider.athlete_id)
    if (!rated) continue
    const powerRatings = POWER_ATTRIBUTES.flatMap(
      (attribute) => rated.find((r) => r.attribute === attribute)?.rating ?? [],
    )
    if (powerRatings.length !== SHAPE_LENGTH) {
      withoutPowerProfile++
      continue
    }
    const probs = riderTypeProbs(
      {
        powerRatings,
        vlamax: input.vlamax.get(rider.athlete_id) ?? null,
        bodyMassKg: input.bodyMass.get(rider.athlete_id) ?? null,
        abs20mSquadPercentile: abs20mPercentile.get(rider.athlete_id) ?? null,
      },
      input.priors,
    )
    const primary = primaryRiderType(probs, rider.type_override)
    const ca = currentAbility(
      primary.overridden ? only(primary.type) : probs,
      input.weights,
      rated.map((r) => ({
        attribute: r.attribute,
        rating: r.rating,
        absoluteRating: r.watts_squad_rating,
        confidence: r.confidence,
      })),
    )
    if (ca === null) throw new Error(`No CA weight applies to ${rider.athlete_id}`)
    rows.push({
      athlete_id: rider.athlete_id,
      as_of: input.asOf,
      set_id: input.setId,
      ca,
      primary_type: primary.type,
      type_overridden: primary.overridden,
      type_probs: probs,
      model_version: MODEL_VERSION,
      computed_at: input.computedAt,
    })
  }
  return { rows, withoutPowerProfile }
}

// Job -----------------------------------------------------------------------

/** Types and rates every rider with ratings on a day and replaces that day's rider_ca_pa. */
export async function runComputeCa(options: {
  store: CaStore
  asOf: string
  now: Date
}): Promise<CaResult> {
  const { store, asOf } = options
  const setId = await store.activeSetId()
  if (setId === null) throw new Error('No benchmark set is active')

  const [riders, ratings, weights, priorRows, vlamax, bodyMass] = await Promise.all([
    store.riders(),
    store.ratings(asOf, setId),
    store.caWeights(),
    store.riderTypePriors(),
    store.latestVlamax(asOf),
    store.bodyMass(asOf),
  ])
  for (const type of RIDER_TYPES) {
    if (!weights.some((w) => w.riderType === type)) {
      throw new Error(`ca_weights has no rows for ${type}`)
    }
  }
  const computedAt = options.now.toISOString()
  const { rows, withoutPowerProfile } = rateAbility({
    asOf,
    setId,
    computedAt,
    riders,
    ratings,
    weights,
    priors: parseRiderTypePriors(priorRows),
    vlamax,
    bodyMass,
  })
  const deleted = await store.replaceCa(asOf, computedAt, rows)
  return {
    as_of: asOf,
    set_id: setId,
    riders: rows.length,
    deleted,
    without_power_profile: withoutPowerProfile,
  }
}
