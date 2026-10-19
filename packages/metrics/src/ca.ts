// Display forms of Current Ability (KB §7).

/** CA on the FM-style 0–200 scale: CA × 10, rounded to a whole number. */
export function caOnFmScale(ca: number): number {
  return Math.round(ca * 10)
}

/** CA as stars: CA ÷ 4, rounded to the nearest half star. */
export function caStars(ca: number): number {
  return Math.round((ca / 4) * 2) / 2
}
