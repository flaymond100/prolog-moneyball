// Pure formulas live here (knowledge base §6–§9). No IO, no DB rows — plain values and arrays only.
// Relative imports use the `.ts` extension so the same source runs under Deno in Edge Functions.
export { ageInYears, trainingAgeYears } from './age.ts'
export { caOnFmScale, caStars } from './ca.ts'
export { retainedPct } from './durability.ts'
export {
  HRV_BASELINE_DAYS,
  HRV_WINDOW_DAYS,
  lnRmssdStats,
  type HrvReading,
  type LnRmssdStats,
} from './hrv.ts'
export { isMeaningfulChange } from './lab.ts'
export { ATL_DAYS, CTL_DAYS, projectLoad, type LoadDay, type LoadState } from './load.ts'
export { RATING_MAX, RATING_MIN, ratingFromAnchors, ratingFromZ } from './rating.ts'
export { best, mean, mostLikely } from './summary.ts'
export {
  WELLNESS_SCALES,
  normaliseWellness,
  normaliseWellnessValue,
  type WellnessField,
} from './wellness.ts'
