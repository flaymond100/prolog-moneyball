// Subjective wellness (KB §4): intervals.icu scales run in different
// directions, so every field is mapped onto 0–1 with 1 the best answer.
// The common range lets the wellness composite (KB §9) average them.

export type WellnessField =
  'sleepQuality' | 'mood' | 'motivation' | 'soreness' | 'fatigue' | 'stress' | 'injury'

/**
 * Each field's best and worst raw value (KB §4).
 * sleepQuality was checked against real data on 2 November 2026: days rated 1
 * had more sleep and higher sleep scores than days rated 2. The other fields
 * follow the KB until a rider logs them.
 */
export const WELLNESS_SCALES: Readonly<Record<WellnessField, { best: number; worst: number }>> = {
  sleepQuality: { best: 1, worst: 4 }, // 1 excellent … 4 poor
  mood: { best: 1, worst: 4 },
  motivation: { best: 1, worst: 4 },
  soreness: { best: 0, worst: 4 }, // 0 none … 4 extreme
  fatigue: { best: 0, worst: 4 },
  stress: { best: 0, worst: 4 },
  injury: { best: 1, worst: 4 }, // 1 excellent … 4 injured
}

/** One raw value on 0–1, higher is better; null when missing or outside the field's scale. */
export function normaliseWellnessValue(
  field: WellnessField,
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  const { best, worst } = WELLNESS_SCALES[field]
  if (value < Math.min(best, worst) || value > Math.max(best, worst)) return null
  return (worst - value) / (worst - best)
}

/** Every subjective field of a wellness record on 0–1, higher is better. */
export function normaliseWellness(
  record: Partial<Record<WellnessField, number | null>>,
): Record<WellnessField, number | null> {
  const fields = Object.keys(WELLNESS_SCALES) as WellnessField[]
  return Object.fromEntries(
    fields.map((field) => [field, normaliseWellnessValue(field, record[field])]),
  ) as Record<WellnessField, number | null>
}
