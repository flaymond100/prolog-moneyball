// Durability (KB §6): power retained after accumulated work.

/** Post-fatigue power as a percentage of fresh power; null when fresh power is not positive. */
export function retainedPct(fresh: number, afterWork: number): number | null {
  if (fresh <= 0) return null
  return (afterWork / fresh) * 100
}
