// Durability (KB §6): power retained after accumulated work.

/** Post-fatigue power as a percentage of fresh power; null when fresh power is not positive. */
export function retainedPct(fresh: number, afterWork: number): number | null {
  if (fresh <= 0) return null
  return (afterWork / fresh) * 100
}

/** Best mean power for one duration, among efforts that start after `kjPerKg` of work. */
export interface PostWorkBest {
  kjPerKg: number
  durationS: number
  watts: number
}

/**
 * Best mean power per duration after accumulated work (KB §6). `watts` is one
 * sample per second of recording; a missing sample counts as 0 W. An effort
 * counts for a threshold when the work done before its first second is at
 * least that many kJ per kg of body mass. A threshold the ride never reaches,
 * or a duration that no longer fits after it, gives no entry.
 */
export function bestPowerAfterWork(
  watts: readonly (number | null)[],
  massKg: number,
  kjPerKgThresholds: readonly number[],
  durationsS: readonly number[],
): PostWorkBest[] {
  if (!(massKg > 0)) throw new RangeError(`Body mass must be positive, got ${massKg}`)
  for (const durationS of durationsS) {
    if (!(durationS > 0) || !Number.isInteger(durationS)) {
      throw new RangeError(`A duration must be a whole number of seconds, got ${durationS}`)
    }
  }
  const power = (i: number): number => watts[i] ?? 0

  const bests: PostWorkBest[] = []
  for (const kjPerKg of kjPerKgThresholds) {
    // The first second by which the work is done.
    const needed = kjPerKg * massKg * 1000
    let joules = 0
    let start = 0
    while (start < watts.length && joules < needed) joules += power(start++)

    for (const durationS of durationsS) {
      let sum = 0
      let best: number | null = null
      for (let i = start; i < watts.length; i++) {
        sum += power(i)
        if (i - start >= durationS) sum -= power(i - durationS)
        if (i - start >= durationS - 1 && (best === null || sum > best)) best = sum
      }
      if (best !== null) bests.push({ kjPerKg, durationS, watts: best / durationS })
    }
  }
  return bests
}
