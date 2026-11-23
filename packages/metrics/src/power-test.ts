// Power tests (KB §10): FTP from a 20-min test and Critical Power from 2–4
// maximal efforts. The 20-min factor comes from `model_priors`.

/** FTP from the mean power of a 20-min all-out effort: factor × power (0.95, Allen & Coggan). */
export function ftpFrom20Min(meanPower20Min: number, factor: number): number {
  return factor * meanPower20Min
}

/** One maximal effort: duration in seconds and mean power (W or W/kg). */
export interface Effort {
  durationS: number
  power: number
}

export interface CriticalPowerFit {
  /** Critical Power, in the unit of the efforts' power. */
  cp: number
  /** W′ (work above CP) in J, or J/kg when the efforts are in W/kg. */
  wPrime: number
  /** R² of the work–time line; null with two efforts, which fit exactly. */
  r2: number | null
}

/**
 * Critical Power by the 2-parameter linear work–time model: work = W′ + CP · t,
 * fitted by least squares over 2 or more efforts of different lengths. Null when
 * the efforts cannot give a model (fewer than two lengths) or give an impossible
 * one (CP or W′ not positive, e.g. a longer effort at higher power).
 */
export function criticalPower(efforts: readonly Effort[]): CriticalPowerFit | null {
  const n = efforts.length
  const t = efforts.map((e) => e.durationS)
  const work = efforts.map((e) => e.power * e.durationS)
  const meanT = t.reduce((sum, x) => sum + x, 0) / n
  const meanW = work.reduce((sum, x) => sum + x, 0) / n
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (const e of efforts) {
    const dx = e.durationS - meanT
    const dy = e.power * e.durationS - meanW
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  if (!(sxx > 0)) return null
  const cp = sxy / sxx
  const wPrime = meanW - cp * meanT
  if (!(cp > 0) || !(wPrime > 0)) return null
  return { cp, wPrime, r2: n > 2 ? (sxy * sxy) / (sxx * syy) : null }
}
