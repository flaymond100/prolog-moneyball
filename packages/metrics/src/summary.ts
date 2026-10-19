// Squad summaries for comparison views (squad mean, squad best). Missing values are skipped.

function present(values: readonly (number | null)[]): number[] {
  return values.filter((v): v is number => v !== null)
}

/** Arithmetic mean, or null when no value is present. */
export function mean(values: readonly (number | null)[]): number | null {
  const xs = present(values)
  if (xs.length === 0) return null
  return xs.reduce((sum, x) => sum + x, 0) / xs.length
}

/** Highest value, or null when no value is present. */
export function best(values: readonly (number | null)[]): number | null {
  const xs = present(values)
  if (xs.length === 0) return null
  return Math.max(...xs)
}

/** Key with the highest probability (first wins on a tie), or null for an empty record. */
export function mostLikely<K extends string>(probs: Readonly<Record<K, number>>): K | null {
  let top: K | null = null
  for (const key of Object.keys(probs) as K[]) {
    if (top === null || probs[key] > probs[top]) top = key
  }
  return top
}
