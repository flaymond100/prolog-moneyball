import { caOnFmScale } from '@prolog/metrics'
import { ATTRIBUTES } from '@/data/labels.ts'
import type { Rider } from '@/data/types.ts'
import { riderAge, riderTrainingAge } from '@/lib/rider.ts'

// Metric registry (task 4.3): one definition per metric, reused by the filter
// builder and the scatter explorer. Adding an entry here makes the metric
// available in both.

export interface MetricDef {
  id: string
  label: string
  unit: string
  decimals: number
  higherIsBetter: boolean
  group: 'General' | 'Ratings' | 'Power' | 'Physiology' | 'Training' | 'Readiness'
  get: (rider: Rider) => number | null
}

const attributeRatings: MetricDef[] = ATTRIBUTES.map((a) => ({
  id: `${a.id}Rating`,
  label: `${a.label} Rating`,
  unit: '1–20',
  decimals: 0,
  higherIsBetter: true,
  group: 'Ratings',
  get: (r) => r.attributes[a.id].rating,
}))

const attributeValues: MetricDef[] = ATTRIBUTES.map((a) => ({
  id: `${a.id}Value`,
  label: a.label,
  unit: a.unit,
  decimals: a.unit === 'W/kg' ? 2 : 0,
  higherIsBetter: true,
  group: a.group === 'physiology' ? 'Physiology' : 'Power',
  get: (r) => r.attributes[a.id].value,
}))

export const METRICS: readonly MetricDef[] = [
  {
    id: 'ca',
    label: 'Current Ability',
    unit: '1–20',
    decimals: 1,
    higherIsBetter: true,
    group: 'General',
    get: (r) => r.caPa.ca,
  },
  {
    id: 'caFm',
    label: 'Current Ability (0–200)',
    unit: '',
    decimals: 0,
    higherIsBetter: true,
    group: 'General',
    get: (r) => caOnFmScale(r.caPa.ca),
  },
  {
    id: 'pa',
    label: 'Potential Ability (P50)',
    unit: '1–20',
    decimals: 1,
    higherIsBetter: true,
    group: 'General',
    get: (r) => r.caPa.paP50,
  },
  {
    id: 'age',
    label: 'Age',
    unit: 'years',
    decimals: 0,
    higherIsBetter: false,
    group: 'General',
    get: riderAge,
  },
  {
    id: 'trainingAge',
    label: 'Training Age',
    unit: 'years',
    decimals: 1,
    higherIsBetter: false,
    group: 'General',
    get: riderTrainingAge,
  },
  ...attributeRatings,
  ...attributeValues,
  {
    id: 'vlamax',
    label: 'VLamax',
    unit: 'mmol/L/s',
    decimals: 2,
    higherIsBetter: false,
    group: 'Physiology',
    get: (r) => r.labTests.at(-1)?.vlamaxMmolLS ?? null,
  },
  {
    id: 'ctl',
    label: 'CTL',
    unit: '',
    decimals: 0,
    higherIsBetter: true,
    group: 'Training',
    get: (r) => r.training.ctl,
  },
  {
    id: 'atl',
    label: 'ATL',
    unit: '',
    decimals: 0,
    higherIsBetter: false,
    group: 'Training',
    get: (r) => r.training.atl,
  },
  {
    id: 'tsb',
    label: 'TSB',
    unit: '',
    decimals: 0,
    higherIsBetter: true,
    group: 'Training',
    get: (r) => r.training.tsb,
  },
  {
    id: 'rampRate',
    label: 'Ramp Rate',
    unit: '',
    decimals: 1,
    higherIsBetter: false,
    group: 'Training',
    get: (r) => r.training.rampRate,
  },
  {
    id: 'compliance',
    label: 'Compliance (12 Weeks)',
    unit: '%',
    decimals: 0,
    higherIsBetter: true,
    group: 'Training',
    get: (r) => r.training.compliance12wPct,
  },
  {
    id: 'indoor',
    label: 'Indoor Rides',
    unit: '%',
    decimals: 0,
    higherIsBetter: false,
    group: 'Training',
    get: (r) => r.training.indoorPct,
  },
  {
    id: 'rides84d',
    label: 'Rides (84 Days)',
    unit: '',
    decimals: 0,
    higherIsBetter: true,
    group: 'Training',
    get: (r) => r.training.rides84d,
  },
  {
    id: 'lnRmssdZ',
    label: 'ln rMSSD vs Baseline',
    unit: 'SD',
    decimals: 1,
    higherIsBetter: true,
    group: 'Readiness',
    get: (r) => r.readiness.lnRmssdZ,
  },
  {
    id: 'restingHr',
    label: 'Resting HR vs Baseline',
    unit: 'bpm',
    decimals: 0,
    higherIsBetter: false,
    group: 'Readiness',
    get: (r) => r.readiness.restingHrDeltaBpm,
  },
  {
    id: 'sleep',
    label: 'Sleep',
    unit: 'h',
    decimals: 1,
    higherIsBetter: true,
    group: 'Readiness',
    get: (r) => r.readiness.sleepHours,
  },
]

export function metricDef(id: string): MetricDef | undefined {
  return METRICS.find((m) => m.id === id)
}

export function metricLabel(m: MetricDef): string {
  return m.unit ? `${m.label} (${m.unit})` : m.label
}

/** Like metricDef, for ids that must exist (defaults); throws on a typo. */
export function requireMetric(id: string): MetricDef {
  const def = metricDef(id)
  if (!def) throw new Error(`Unknown metric: ${id}`)
  return def
}
