import { caOnFmScale } from '@prolog/metrics'
import { ATTRIBUTES } from '@/data/labels.ts'
import type { Rider } from '@/data/types.ts'
import { powerWatts, riderAge, riderTrainingAge } from '@/lib/rider.ts'

// Metric registry (task 4.3): one definition per metric, reused by the squad
// table, the filter builder and the scatter explorer. Adding an entry here makes
// the metric available in all three (the table adds a plain column unless a
// hand-made one shows it, see pages/squad/columns.tsx).

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

// Absolute watts beside W/kg, for filters, scatter and the W view of the table.
const attributeWatts: MetricDef[] = ATTRIBUTES.filter((a) => a.secs !== undefined).map((a) => ({
  id: `${a.id}Watts`,
  label: a.label,
  unit: 'W',
  decimals: 0,
  higherIsBetter: true,
  group: 'Power',
  get: (r) => powerWatts(r, a.id),
}))

export const METRICS: readonly MetricDef[] = [
  {
    id: 'ca',
    label: 'Current Ability',
    unit: '1–20',
    decimals: 1,
    higherIsBetter: true,
    group: 'General',
    get: (r) => r.caPa?.ca ?? null,
  },
  {
    id: 'caFm',
    label: 'Current Ability (0–200)',
    unit: '',
    decimals: 0,
    higherIsBetter: true,
    group: 'General',
    get: (r) => (r.caPa ? caOnFmScale(r.caPa.ca) : null),
  },
  {
    id: 'pa',
    label: 'Potential Ability (P50)',
    unit: '1–20',
    decimals: 1,
    higherIsBetter: true,
    group: 'General',
    get: (r) => r.caPa?.paP50 ?? null,
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
  ...attributeWatts,
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
    id: 'fatmax',
    label: 'FatMax',
    unit: 'W',
    decimals: 0,
    higherIsBetter: true,
    group: 'Physiology',
    get: (r) => r.labTests.at(-1)?.fatmaxW ?? null,
  },
  {
    id: 'carbmax',
    label: 'CarbMax',
    unit: 'g/h',
    decimals: 0,
    higherIsBetter: true,
    group: 'Physiology',
    get: (r) => r.labTests.at(-1)?.carbmaxGH ?? null,
  },
  {
    id: 'at',
    label: 'Anaerobic Threshold',
    unit: 'W',
    decimals: 0,
    higherIsBetter: true,
    group: 'Physiology',
    get: (r) => r.labTests.at(-1)?.atW ?? null,
  },
  {
    // intervals.icu's estimate (KB §9); never rated against the 60-min benchmark (KB §6).
    id: 'eftp',
    label: 'eFTP',
    unit: 'W/kg',
    decimals: 2,
    higherIsBetter: true,
    group: 'Training',
    get: (r) => r.form.eftpWkg.at(-1)?.value ?? null,
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
