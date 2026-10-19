import type { LabTest } from '@/data/types.ts'

// Valid ranges from KB §10. They mirror the check constraints in
// supabase/migrations/20261019124247_lab_tests_anthropometrics.sql, and the
// labels match its error messages so the form and the database agree.

export interface RangeField<K extends string = string> {
  key: K
  label: string
  shortLabel: string
  unit: string
  min: number
  max: number
  step: number
}

type LabKey = keyof Pick<
  LabTest,
  | 'vo2maxMlKgMin'
  | 'vo2maxLMin'
  | 'vlamaxMmolLS'
  | 'fatmaxW'
  | 'fatmaxGH'
  | 'carbmaxGH'
  | 'atW'
  | 'weightKg'
  | 'heightCm'
  | 'bodyFatPct'
>

export const LAB_RANGES: readonly RangeField<LabKey>[] = [
  {
    key: 'vo2maxMlKgMin',
    label: 'VO2max (mL/kg/min)',
    shortLabel: 'VO2max',
    unit: 'mL/kg/min',
    min: 30,
    max: 90,
    step: 0.1,
  },
  {
    key: 'vo2maxLMin',
    label: 'VO2max (L/min)',
    shortLabel: 'VO2max',
    unit: 'L/min',
    min: 1.5,
    max: 6.0,
    step: 0.01,
  },
  {
    key: 'vlamaxMmolLS',
    label: 'VLamax (mmol/L/s)',
    shortLabel: 'VLamax',
    unit: 'mmol/L/s',
    min: 0.1,
    max: 1.5,
    step: 0.01,
  },
  {
    key: 'fatmaxW',
    label: 'FatMax (W)',
    shortLabel: 'FatMax',
    unit: 'W',
    min: 50,
    max: 400,
    step: 1,
  },
  {
    key: 'fatmaxGH',
    label: 'FatMax (g/h)',
    shortLabel: 'FatMax',
    unit: 'g/h',
    min: 10,
    max: 120,
    step: 1,
  },
  {
    key: 'carbmaxGH',
    label: 'CarbMax (g/h)',
    shortLabel: 'CarbMax',
    unit: 'g/h',
    min: 20,
    max: 200,
    step: 1,
  },
  {
    key: 'atW',
    label: 'Anaerobic threshold (W)',
    shortLabel: 'AT',
    unit: 'W',
    min: 100,
    max: 450,
    step: 1,
  },
  {
    key: 'weightKg',
    label: 'Weight (kg)',
    shortLabel: 'Weight',
    unit: 'kg',
    min: 35,
    max: 100,
    step: 0.1,
  },
  {
    key: 'heightCm',
    label: 'Height (cm)',
    shortLabel: 'Height',
    unit: 'cm',
    min: 140,
    max: 200,
    step: 0.5,
  },
  {
    key: 'bodyFatPct',
    label: 'Body fat (%)',
    shortLabel: 'Body fat',
    unit: '%',
    min: 5,
    max: 40,
    step: 0.1,
  },
]

export const BODY_RANGES = LAB_RANGES.filter((f) =>
  ['heightCm', 'weightKg', 'bodyFatPct'].includes(f.key),
)

/** Lab metrics tracked between tests (KB §10): shown in the slope chart and delta table. */
export const TRACKED_LAB_METRICS = LAB_RANGES.filter((f) =>
  ['vo2maxMlKgMin', 'vlamaxMmolLS', 'fatmaxW', 'carbmaxGH', 'atW'].includes(f.key),
)

export function rangeMessage(f: RangeField): string {
  return `${f.label} must be between ${String(f.min)} and ${String(f.max)}.`
}
