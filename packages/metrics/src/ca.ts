// Current Ability (KB §7): its display forms and the formula.

import type { RiderType } from './rider-type.ts'

/** CA on the FM-style 0–200 scale: CA × 10, rounded to a whole number. */
export function caOnFmScale(ca: number): number {
  return Math.round(ca * 10)
}

/** CA as stars: CA ÷ 4, rounded to the nearest half star. */
export function caStars(ca: number): number {
  return Math.round((ca / 4) * 2) / 2
}

// Current Ability (KB §7) ------------------------------------------------------

/** A low-confidence attribute counts at 50% weight (KB §6). */
const CONFIDENCE_FACTOR = { high: 1, low: 0.5 } as const

/** One `ca_weights` row: a type's weight in per cent for an attribute. */
export interface CaWeight {
  riderType: RiderType
  attribute: string
  weight: number
  /** The type rates this attribute on absolute watts, not W/kg (Rouleur/TT 20 and 60 min). */
  absoluteWatts: boolean
}

/** A rider's rating for one attribute. */
export interface CaRating {
  attribute: string
  rating: number
  /** Rating of the absolute watts, where the attribute has one. */
  absoluteRating: number | null
  confidence: 'high' | 'low'
}

/**
 * CA = Σ w·c·r ÷ Σ w·c, with w = Σ p_t · W_t for the type probabilities p,
 * c the confidence factor and r the rating. A type that rates an attribute
 * on absolute watts contributes its share of w to the absolute rating. An
 * attribute without a rating drops out and the rest renormalise; null when
 * nothing is left.
 */
export function currentAbility(
  typeProbs: Readonly<Record<RiderType, number>>,
  weights: readonly CaWeight[],
  ratings: readonly CaRating[],
): number | null {
  const byAttribute = new Map(ratings.map((rated) => [rated.attribute, rated]))
  let weighted = 0
  let total = 0
  for (const w of weights) {
    const rated = byAttribute.get(w.attribute)
    if (!rated) continue
    const rating = w.absoluteWatts ? rated.absoluteRating : rated.rating
    if (rating === null) continue
    const wc = typeProbs[w.riderType] * w.weight * CONFIDENCE_FACTOR[rated.confidence]
    weighted += wc * rating
    total += wc
  }
  return total > 0 ? weighted / total : null
}
