import { criticalPower, ftpFrom20Min } from '@prolog/metrics'
import type { PowerTest, PowerTestMethod } from '@/data/types.ts'

// Results of power field tests (KB §10). The formulas live in @prolog/metrics;
// this file only applies them to a stored test.

export const POWER_TEST_LABELS: Record<PowerTestMethod, string> = {
  ftp_20min: 'FTP 20-Min Test',
  cp: 'Critical Power',
}

/** Power-test results tracked between tests, keyed for the typical-error settings. */
export const POWER_TEST_METRICS = [
  { key: 'ftpW', label: 'FTP (W)', step: 1 },
  { key: 'cpW', label: 'CP (W)', step: 1 },
] as const

/** CP efforts: 2–4 maximal efforts between 2 and 20 min (KB §10). */
export const CP_EFFORTS = { min: 2, max: 4, minS: 120, maxS: 1200 } as const

export interface PowerTestResult {
  /** FTP for the 20-min test, CP for a Critical Power test. */
  label: 'FTP' | 'CP'
  metricKey: (typeof POWER_TEST_METRICS)[number]['key']
  watts: number
  /** Null without a body mass on the test day. */
  wkg: number | null
  /** W′ in kJ; CP only. */
  wPrimeKj: number | null
  /** Fit quality of the CP line; null for FTP and for two efforts. */
  r2: number | null
}

/** FTP or CP of a test; null when its efforts give no valid CP. */
export function powerTestResult(test: PowerTest, ftpFactor: number): PowerTestResult | null {
  if (test.method === 'ftp_20min') {
    const effort = test.efforts[0]
    if (!effort) return null
    return {
      label: 'FTP',
      metricKey: 'ftpW',
      watts: ftpFrom20Min(effort.watts, ftpFactor),
      wkg: effort.wkg === null ? null : ftpFrom20Min(effort.wkg, ftpFactor),
      wPrimeKj: null,
      r2: null,
    }
  }
  const fit = criticalPower(test.efforts.map((e) => ({ durationS: e.durationS, power: e.watts })))
  if (!fit) return null
  const wkgEfforts = test.efforts.flatMap((e) =>
    e.wkg === null ? [] : [{ durationS: e.durationS, power: e.wkg }],
  )
  const wkgFit = wkgEfforts.length === test.efforts.length ? criticalPower(wkgEfforts) : null
  return {
    label: 'CP',
    metricKey: 'cpW',
    watts: fit.cp,
    wkg: wkgFit?.cp ?? null,
    wPrimeKj: fit.wPrime / 1000,
    r2: fit.r2,
  }
}

/** An effort's duration as "12 min" or "2:30 min". */
export function formatEffortDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0
    ? `${String(minutes)} min`
    : `${String(minutes)}:${String(rest).padStart(2, '0')} min`
}
