// Attribute ratings on the 1–20 scale (KB §6). The benchmark comes from
// `benchmark_points`; these functions only apply it.

export const RATING_MIN = 1
export const RATING_MAX = 20
/** The female-pro mean rates 15 and each SD is worth 2.5 points (KB §6). */
const RATING_AT_MEAN = 15
const RATING_PER_SD = 2.5

interface Anchor {
  value: number
  rating: number
}

function clampRating(rating: number): number {
  return Math.min(RATING_MAX, Math.max(RATING_MIN, rating))
}

/** Rating for a benchmark with mean and SD: clamp(15 + 2.5 · (x − μ) / σ, 1, 20). */
export function ratingFromZ(x: number, mean: number, sd: number): number {
  if (!(sd > 0)) throw new RangeError(`Benchmark SD must be positive, got ${sd}`)
  return clampRating(RATING_AT_MEAN + (RATING_PER_SD * (x - mean)) / sd)
}

/**
 * Rating for a benchmark with anchor points: piecewise-linear between anchors,
 * extrapolated with the nearest segment's slope, clamped to 1–20.
 * `values` must be strictly increasing, as `benchmark_points` enforces.
 */
export function ratingFromAnchors(
  x: number,
  values: readonly number[],
  ratings: readonly number[],
): number {
  const malformed = new RangeError('Anchors need at least two values with one rating each')
  // The segment that contains x, or the first or last one when x lies outside.
  let previous: Anchor | undefined
  let segment: readonly [Anchor, Anchor] | undefined
  for (const [i, value] of values.entries()) {
    const rating = ratings[i]
    if (rating === undefined) throw malformed
    const anchor = { value, rating }
    if (previous) {
      if (!(value > previous.value)) {
        throw new RangeError('Anchor values must be strictly increasing')
      }
      // Move on to this segment while x lies beyond the one before.
      if (!segment || x > previous.value) segment = [previous, anchor]
    }
    previous = anchor
  }
  if (!segment || ratings.length !== values.length) throw malformed
  const [lo, hi] = segment
  return clampRating(lo.rating + ((x - lo.value) * (hi.rating - lo.rating)) / (hi.value - lo.value))
}
