// HRV readiness statistics (KB §9, §10). Works on ln(rMSSD): a rider's
// 7-day picture against her own 60-day baseline, never raw rMSSD across riders.
import { daysBetween } from './date.ts'

export const HRV_WINDOW_DAYS = 7
export const HRV_BASELINE_DAYS = 60

export interface HrvReading {
  /** Local date of the morning reading, `YYYY-MM-DD`. */
  date: string
  /** rMSSD in ms; null or non-positive readings are skipped. */
  rmssd: number | null
}

export interface LnRmssdStats {
  /** Readings in the 7 days ending on the as-of date (the readiness light needs at least 3, KB §9). */
  readings7d: number
  mean7d: number | null
  /** Coefficient of variation of the 7-day ln rMSSD, %. Needs two readings. */
  cv7dPct: number | null
  baselineMean60d: number | null
  /** Sample SD of ln rMSSD over the 60-day baseline. Needs two readings. */
  baselineSd60d: number | null
  /** 7-day mean as a z-score against the 60-day baseline (KB §10 cross-rider views). */
  z7d: number | null
}

/** Mean and sample SD; the SD needs two values. */
function summarise(xs: readonly number[]): { mean: number; sd: number | null } | null {
  if (xs.length === 0) return null
  const mean = xs.reduce((sum, x) => sum + x, 0) / xs.length
  if (xs.length < 2) return { mean, sd: null }
  return { mean, sd: Math.sqrt(xs.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (xs.length - 1)) }
}

/**
 * ln rMSSD statistics on `asOf`. Both windows end on `asOf` and include it; the
 * 60-day baseline includes the last 7 days. Readings after `asOf` are ignored.
 * Pass readings from the rider's baseline source only (KB §10).
 */
export function lnRmssdStats(readings: readonly HrvReading[], asOf: string): LnRmssdStats {
  const window: number[] = []
  const baseline: number[] = []
  for (const { date, rmssd } of readings) {
    if (rmssd === null || !(rmssd > 0)) continue
    const daysAgo = daysBetween(date, asOf)
    if (daysAgo < 0 || daysAgo >= HRV_BASELINE_DAYS) continue
    const ln = Math.log(rmssd)
    baseline.push(ln)
    if (daysAgo < HRV_WINDOW_DAYS) window.push(ln)
  }

  const recent = summarise(window)
  const base = summarise(baseline)
  return {
    readings7d: window.length,
    mean7d: recent ? recent.mean : null,
    cv7dPct: recent && recent.sd !== null ? (recent.sd / recent.mean) * 100 : null,
    baselineMean60d: base ? base.mean : null,
    baselineSd60d: base ? base.sd : null,
    // Null without a spread in the baseline, as a z-score is undefined then.
    z7d: base?.sd && recent ? (recent.mean - base.mean) / base.sd : null,
  }
}
