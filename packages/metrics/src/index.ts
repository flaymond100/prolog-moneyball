// Pure formulas live here (knowledge base §6–§9). No IO, no DB rows — plain values and arrays only.
// Relative imports use the `.ts` extension so the same source runs under Deno in Edge Functions.
export { ageInYears, trainingAgeYears } from './age.ts'
export { caOnFmScale, caStars } from './ca.ts'
export { retainedPct } from './durability.ts'
export { isMeaningfulChange } from './lab.ts'
export { best, mean, mostLikely } from './summary.ts'
