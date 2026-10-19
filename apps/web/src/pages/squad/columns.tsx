import { caOnFmScale } from '@prolog/metrics'
import { Link } from '@tanstack/react-router'
import { createColumnHelper, type RowData } from '@tanstack/react-table'
import { ChangeArrow } from '@/components/change-arrow.tsx'
import { RatingChip } from '@/components/rating-chip.tsx'
import { ReadinessLight } from '@/components/readiness-light.tsx'
import { attributeMeta, RIDER_TYPE_LABELS } from '@/data/labels.ts'
import type { AttributeId, LabTest, Rider } from '@/data/types.ts'
import type { CsvCell } from '@/lib/csv.ts'
import { formatNumber } from '@/lib/format.ts'
import { primaryType, riderAge, riderTrainingAge } from '@/lib/rider.ts'

export const COLUMN_GROUPS = [
  { id: 'general', label: 'General' },
  { id: 'power', label: 'Power' },
  { id: 'durability', label: 'Durability' },
  { id: 'physiology', label: 'Physiology' },
  { id: 'training', label: 'Training' },
  { id: 'readiness', label: 'Readiness' },
] as const

export type ColumnGroupId = (typeof COLUMN_GROUPS)[number]['id']

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match the library's
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Column-group tab; the rider column has none and is always shown. */
    group?: ColumnGroupId
    /** Full name for the column chooser and the CSV header. */
    label: string
    csv: (row: TData) => CsvCell
    numeric?: boolean
  }
}

const col = createColumnHelper<Rider>()

function latestLab(rider: Rider): LabTest | undefined {
  return rider.labTests.at(-1)
}

function ratingColumn(id: AttributeId, group: ColumnGroupId, decimals: number) {
  const meta = attributeMeta(id)
  return col.accessor((r) => r.attributes[id].rating, {
    id,
    header: meta.shortLabel,
    cell: ({ row }) => {
      const a = row.original.attributes[id]
      return (
        <span className="inline-flex items-center gap-1.5">
          <RatingChip rating={a.rating} lowConfidence={a.confidence === 'low'} />
          <ChangeArrow change={a.change28d} />
          <span className="text-xs text-muted-foreground">{formatNumber(a.value, decimals)}</span>
        </span>
      )
    },
    meta: {
      group,
      label: `${meta.label} (Rating)`,
      csv: (r) => r.attributes[id].rating,
      numeric: true,
    },
  })
}

function numberColumn(
  id: string,
  header: string,
  label: string,
  group: ColumnGroupId,
  get: (r: Rider) => number | null,
  decimals = 0,
  signed = false,
) {
  return col.accessor((r) => get(r) ?? undefined, {
    id,
    header,
    sortUndefined: 'last',
    cell: ({ getValue }) => {
      const v = getValue()
      return v === undefined ? '–' : formatNumber(v, decimals, signed)
    },
    meta: { group, label, csv: (r) => get(r), numeric: true },
  })
}

export const squadColumns = [
  col.accessor('name', {
    id: 'name',
    header: 'Rider',
    cell: ({ row }) => (
      <Link
        to="/riders/$riderId"
        params={{ riderId: row.original.id }}
        className="font-medium hover:text-primary"
      >
        {row.original.name}
      </Link>
    ),
    meta: { label: 'Rider', csv: (r) => r.name },
  }),

  // General
  col.accessor((r) => RIDER_TYPE_LABELS[primaryType(r)], {
    id: 'type',
    header: 'Type',
    meta: { group: 'general', label: 'Rider Type', csv: (r) => RIDER_TYPE_LABELS[primaryType(r)] },
  }),
  numberColumn('age', 'Age', 'Age', 'general', riderAge),
  numberColumn('trainingAge', 'Train. Age', 'Training Age (Years)', 'general', riderTrainingAge, 1),
  col.accessor((r) => r.caPa.ca, {
    id: 'ca',
    header: 'CA',
    cell: ({ getValue }) => <RatingChip rating={getValue()} decimals={1} />,
    meta: { group: 'general', label: 'Current Ability', csv: (r) => r.caPa.ca, numeric: true },
  }),
  numberColumn('caFm', 'CA /200', 'Current Ability (0–200)', 'general', (r) =>
    caOnFmScale(r.caPa.ca),
  ),
  col.accessor((r) => r.caPa.paP50, {
    id: 'pa',
    header: 'PA',
    cell: ({ row }) => {
      const { paP10, paP50, paP90 } = row.original.caPa
      return (
        <span>
          {formatNumber(paP50, 1)}{' '}
          <span className="text-xs text-muted-foreground">
            ({formatNumber(paP10, 1)}–{formatNumber(paP90, 1)})
          </span>
        </span>
      )
    },
    meta: {
      group: 'general',
      label: 'Potential Ability (P50)',
      csv: (r) => r.caPa.paP50,
      numeric: true,
    },
  }),
  numberColumn('rides84d', 'Rides 84 d', 'Rides in 84 Days', 'general', (r) => r.training.rides84d),

  // Power (84-day window)
  ratingColumn('p5s', 'power', 1),
  ratingColumn('p30s', 'power', 1),
  ratingColumn('p1m', 'power', 1),
  ratingColumn('p5m', 'power', 2),
  ratingColumn('p20m', 'power', 2),
  ratingColumn('p60m', 'power', 2),

  // Durability
  ratingColumn('durability', 'durability', 0),

  // Physiology (latest lab test)
  ratingColumn('vo2max', 'physiology', 1),
  numberColumn(
    'vlamax',
    'VLamax',
    'VLamax (mmol/L/s)',
    'physiology',
    (r) => latestLab(r)?.vlamaxMmolLS ?? null,
    2,
  ),
  numberColumn(
    'fatmax',
    'FatMax W',
    'FatMax (W)',
    'physiology',
    (r) => latestLab(r)?.fatmaxW ?? null,
  ),
  numberColumn(
    'carbmax',
    'CarbMax g/h',
    'CarbMax (g/h)',
    'physiology',
    (r) => latestLab(r)?.carbmaxGH ?? null,
  ),
  numberColumn(
    'at',
    'AT W',
    'Anaerobic Threshold (W)',
    'physiology',
    (r) => latestLab(r)?.atW ?? null,
  ),

  // Training
  numberColumn('ctl', 'CTL', 'CTL', 'training', (r) => r.training.ctl),
  numberColumn('atl', 'ATL', 'ATL', 'training', (r) => r.training.atl),
  numberColumn('tsb', 'TSB', 'TSB', 'training', (r) => r.training.tsb, 0, true),
  numberColumn('ramp', 'Ramp', 'Ramp Rate', 'training', (r) => r.training.rampRate, 1, true),
  numberColumn(
    'compliance',
    'Compl. 12 wk %',
    'Compliance, 12 Weeks (%)',
    'training',
    (r) => r.training.compliance12wPct,
  ),
  numberColumn('indoor', 'Indoor %', 'Indoor Rides (%)', 'training', (r) => r.training.indoorPct),

  // Readiness
  col.accessor((r) => r.readiness.light, {
    id: 'readiness',
    header: 'Readiness',
    cell: ({ row }) => (
      <span className="inline-flex flex-col">
        <ReadinessLight light={row.original.readiness.light} />
        {row.original.readiness.reasons.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {row.original.readiness.reasons.join(', ')}
          </span>
        )}
      </span>
    ),
    meta: {
      group: 'readiness',
      label: 'Readiness',
      csv: (r) => [r.readiness.light, ...r.readiness.reasons].join('; '),
    },
  }),
  numberColumn(
    'hrvZ',
    'ln rMSSD z',
    'ln rMSSD vs Baseline (z)',
    'readiness',
    (r) => r.readiness.lnRmssdZ,
    1,
    true,
  ),
  numberColumn(
    'rhr',
    'Resting HR Δ',
    'Resting HR vs Baseline (bpm)',
    'readiness',
    (r) => r.readiness.restingHrDeltaBpm,
    0,
    true,
  ),
  numberColumn('sleep', 'Sleep h', 'Sleep (Hours)', 'readiness', (r) => r.readiness.sleepHours, 1),
]
