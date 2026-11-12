// Rider type (KB §7): a probability over five types from the shape of the
// power profile. Prototypes, bonuses and τ come from `model_priors`; these
// functions only apply them.

/** The five types, in KB §7 order. */
export const RIDER_TYPES = ['sprinter', 'puncheur', 'climber', 'rouleur_tt', 'all_rounder'] as const
export type RiderType = (typeof RIDER_TYPES)[number]

/** Durations of the shape vector: 5 s, 30 s, 1 min, 5 min, 20 min, 60 min. */
export const SHAPE_LENGTH = 6

/** The `rider_type` rows of `model_priors`. */
export interface RiderTypePriors {
  /** Shape prototype per type, in the order of the shape vector. */
  prototypes: Readonly<Record<RiderType, readonly number[]>>
  /** Softmax temperature τ. */
  tau: number
  /** Added to the sprinter score when VLamax ≥ `vlamaxMin` (mmol/L/s). */
  sprinterBonus: { score: number; vlamaxMin: number }
  /** Added to the climber score when body mass ≤ `massMaxKg`. */
  climberBonus: { score: number; massMaxKg: number }
  /** Added to the Rouleur/TT score when absolute 20-min power ≥ this squad percentile (0–100). */
  rouleurTtBonus: { score: number; abs20mPercentileMin: number }
}

export interface RiderTypeInput {
  /** Ratings for 5 s, 30 s, 1 min, 5 min, 20 min and 60 min, in that order. */
  powerRatings: readonly number[]
  /** Latest lab VLamax in mmol/L/s, if any. */
  vlamax: number | null
  bodyMassKg: number | null
  /** Squad percentile (0–100) of the rider's absolute 20-min power, if any. */
  abs20mSquadPercentile: number | null
}

/** One value per type. */
function byType(value: (type: RiderType) => number): Record<RiderType, number> {
  return {
    sprinter: value('sprinter'),
    puncheur: value('puncheur'),
    climber: value('climber'),
    rouleur_tt: value('rouleur_tt'),
    all_rounder: value('all_rounder'),
  }
}

/** The six power ratings minus the rider's own mean rating. */
export function shapeVector(powerRatings: readonly number[]): number[] {
  if (powerRatings.length !== SHAPE_LENGTH) {
    throw new RangeError(`A shape vector needs ${SHAPE_LENGTH} ratings, got ${powerRatings.length}`)
  }
  const mean = powerRatings.reduce((sum, r) => sum + r, 0) / SHAPE_LENGTH
  return powerRatings.map((r) => r - mean)
}

/** (Euclidean distance)² between a shape vector and a type's prototype. */
function squaredDistance(shape: readonly number[], prototype: readonly number[]): number {
  const malformed = new RangeError(
    `A shape prototype needs ${SHAPE_LENGTH} values, got ${prototype.length}`,
  )
  let sum = 0
  for (const [i, s] of shape.entries()) {
    const p = prototype[i]
    if (p === undefined) throw malformed
    sum += (s - p) ** 2
  }
  if (prototype.length !== shape.length) throw malformed
  return sum
}

/**
 * Probability of each rider type: score = −(Euclidean distance)² between the
 * rider's shape vector and the type's prototype, plus the type's bonus when
 * its rule holds; probabilities = softmax(score ÷ τ). A rule whose input is
 * missing gives no bonus.
 */
export function riderTypeProbs(
  input: RiderTypeInput,
  priors: RiderTypePriors,
): Record<RiderType, number> {
  const { tau, sprinterBonus, climberBonus, rouleurTtBonus } = priors
  if (!(tau > 0)) throw new RangeError(`Softmax τ must be positive, got ${tau}`)
  const shape = shapeVector(input.powerRatings)

  const bonus = byType(() => 0)
  if (input.vlamax !== null && input.vlamax >= sprinterBonus.vlamaxMin) {
    bonus.sprinter = sprinterBonus.score
  }
  if (input.bodyMassKg !== null && input.bodyMassKg <= climberBonus.massMaxKg) {
    bonus.climber = climberBonus.score
  }
  if (
    input.abs20mSquadPercentile !== null &&
    input.abs20mSquadPercentile >= rouleurTtBonus.abs20mPercentileMin
  ) {
    bonus.rouleur_tt = rouleurTtBonus.score
  }

  const scores = byType((type) => -squaredDistance(shape, priors.prototypes[type]) + bonus[type])
  // Shifting by the highest score leaves the softmax unchanged and keeps exp() in range.
  const top = Math.max(...RIDER_TYPES.map((type) => scores[type]))
  const weights = byType((type) => Math.exp((scores[type] - top) / tau))
  const total = RIDER_TYPES.reduce((sum, type) => sum + weights[type], 0)
  return byType((type) => weights[type] / total)
}

/**
 * The rider's primary type: the manual override when set, otherwise the most
 * likely type (on a tie, the earlier one in KB §7 order).
 */
export function primaryRiderType(
  probs: Readonly<Record<RiderType, number>>,
  override: RiderType | null,
): { type: RiderType; overridden: boolean } {
  if (override !== null) return { type: override, overridden: true }
  let top: RiderType = RIDER_TYPES[0]
  for (const type of RIDER_TYPES) {
    if (probs[type] > probs[top]) top = type
  }
  return { type: top, overridden: false }
}
