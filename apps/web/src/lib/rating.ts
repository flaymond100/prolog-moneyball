export type RatingBand = 1 | 2 | 3 | 4

export const RATING_MIN = 1
export const RATING_MAX = 20

/**
 * Colour band for a 1–20 rating (KB §6): 1–5 → 1 (red), 6–10 → 2 (amber),
 * 11–15 → 3 (green), 16–20 → 4 (teal). Decimal ratings (e.g. CA 14.6) are rounded first.
 */
export function ratingBand(rating: number): RatingBand {
  const r = Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round(rating)))
  if (r <= 5) return 1
  if (r <= 10) return 2
  if (r <= 15) return 3
  return 4
}
