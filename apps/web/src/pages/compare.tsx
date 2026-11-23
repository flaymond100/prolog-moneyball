import { best, mean, retainedPct } from '@prolog/metrics'
import { getRouteApi } from '@tanstack/react-router'
import type { EChartsOption } from 'echarts'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Chart } from '@/components/chart.tsx'
import { RatingChip } from '@/components/rating-chip.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'
import { ATTRIBUTES } from '@/data/labels.ts'
import { PRO_MEAN_RATING } from '@/data/mock/benchmarks.ts'
import { useSquad } from '@/data/queries.ts'
import type { AttributeId, Rider } from '@/data/types.ts'
import { axisStyle, tooltipStyle, useChartTokens, type ChartTokens } from '@/lib/chart-theme.ts'
import { formatNumber } from '@/lib/format.ts'
import { cn } from '@/lib/utils.ts'
import { PowerUnitToggle } from '@/components/power-unit-toggle.tsx'
import { usePowerUnit, type PowerUnit } from '@/data/power-unit-store.ts'
import { attributeUnit, attributeValue } from '@/lib/rider.ts'
import { Panel } from '@/pages/rider/panels.tsx'

const route = getRouteApi('/app/compare')

// The radar shows the six power durations; durability and VO2max stay in the table.
const RADAR_ATTRIBUTES = ATTRIBUTES.filter((a) => a.secs !== undefined)

/** Up to four riders, each in a fixed colour (KB §12: A violet, B orange). */
const SLOTS = ['a', 'b', 'c', 'd'] as const
type Slot = (typeof SLOTS)[number]
const SLOT_SWATCH: Record<Slot, string> = {
  a: 'bg-rider-a',
  b: 'bg-rider-b',
  c: 'bg-rider-c',
  d: 'bg-rider-d',
}

interface Pick {
  slot: Slot
  rider: Rider
}

function slotColor(t: ChartTokens, slot: Slot): string {
  return { a: t.riderA, b: t.riderB, c: t.riderC, d: t.riderD }[slot]
}

/** Which reference lines the radar shows; all off until switched on. */
interface References {
  mean: boolean
  best: boolean
  pro: boolean
}

// Unrated attributes plot at 0; the radar only shows once someone is rated.
function ratings(rider: Rider): number[] {
  return RADAR_ATTRIBUTES.map((a) => rider.attributes[a.id].rating ?? 0)
}

function hasRatings(rider: Rider): boolean {
  return RADAR_ATTRIBUTES.some((a) => rider.attributes[a.id].rating !== null)
}

function squadSummary(riders: Rider[], summarise: typeof mean): number[] {
  return RADAR_ATTRIBUTES.map((a) => summarise(riders.map((r) => r.attributes[a.id].rating)) ?? 0)
}

function RiderPicker({
  slot,
  value,
  riders,
  exclude,
  onChange,
  onRemove,
}: {
  slot: Slot
  value: string
  riders: Rider[]
  exclude: readonly string[]
  onChange: (id: string) => void
  onRemove?: () => void
}) {
  const label = `Rider ${slot.toUpperCase()}`
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={cn('size-3 rounded-full', SLOT_SWATCH[slot])} aria-hidden="true" />
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="w-48">
          <SelectValue placeholder="Choose a rider" />
        </SelectTrigger>
        <SelectContent>
          {riders.map((r) => (
            <SelectItem key={r.id} value={r.id} disabled={exclude.includes(r.id)}>
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {onRemove && (
        <Button variant="ghost" size="icon" aria-label={`Remove ${label}`} onClick={onRemove}>
          <X aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}

function line(
  name: string,
  value: number[],
  color: string,
  type: 'solid' | 'dashed' | 'dotted',
  area = false,
) {
  return {
    name,
    value,
    symbol: 'circle',
    symbolSize: 6,
    lineStyle: { width: 2, color, type },
    itemStyle: { color },
    areaStyle: area ? { color, opacity: 0.1 } : undefined,
  }
}

const LEGEND = { top: 0, left: 0, itemWidth: 16, itemHeight: 2 } as const

function radarOption(
  t: ChartTokens,
  picks: readonly Pick[],
  squad: Rider[],
  show: References,
): EChartsOption {
  // Riders in colour; the references stay neutral so they never look like a rider.
  const data = [
    ...picks.map((p) => line(p.rider.name, ratings(p.rider), slotColor(t, p.slot), 'solid', true)),
    ...(show.mean ? [line('Squad Mean', squadSummary(squad, mean), t.reference, 'dotted')] : []),
    ...(show.best ? [line('Squad Best', squadSummary(squad, best), t.reference, 'dashed')] : []),
    ...(show.pro
      ? [
          line(
            'Pro Mean',
            RADAR_ATTRIBUTES.map(() => PRO_MEAN_RATING),
            t.text,
            'dashed',
          ),
        ]
      : []),
  ]

  return {
    legend: { ...LEGEND, textStyle: { color: t.muted } },
    tooltip: { trigger: 'item', ...tooltipStyle(t) },
    radar: {
      center: ['50%', '56%'],
      radius: '74%',
      splitNumber: 4,
      indicator: RADAR_ATTRIBUTES.map((attr) => ({ name: attr.shortLabel, min: 0, max: 20 })),
      axisName: { color: t.muted, fontSize: 11 },
      axisLine: { lineStyle: { color: t.grid } },
      splitLine: { lineStyle: { color: t.grid } },
      splitArea: { show: false },
    },
    series: [{ type: 'radar', data, emphasis: { focus: 'self' } }],
  }
}

/**
 * Until ratings exist (TODO 7.1), the radar compares measured values instead:
 * each power duration as a percentage of the squad's best value for it. Only
 * durations someone in the squad has a value for are plotted.
 */
function valueRadarOption(
  t: ChartTokens,
  picks: readonly Pick[],
  squad: Rider[],
  unit: PowerUnit,
  show: References,
): EChartsOption {
  const v = (r: Rider, id: AttributeId) => attributeValue(r, id, unit)
  const attrs = RADAR_ATTRIBUTES.filter((attr) => best(squad.map((r) => v(r, attr.id))) !== null)
  const squadBest = attrs.map((attr) => best(squad.map((r) => v(r, attr.id))) ?? 1)
  const share = (values: (number | null)[]) =>
    values.map((x, i) => (x === null ? 0 : Math.round((x / (squadBest[i] ?? 1)) * 1000) / 10))
  const of = (r: Rider) => share(attrs.map((attr) => v(r, attr.id)))
  const squadMean = share(attrs.map((attr) => mean(squad.map((r) => v(r, attr.id)))))

  // Start the scale below the lowest share so small differences stay visible.
  const lowest = Math.min(...picks.flatMap((p) => of(p.rider)), ...(show.mean ? squadMean : []))
  const min = Math.max(0, Math.floor((lowest - 10) / 10) * 10)

  return {
    legend: { ...LEGEND, textStyle: { color: t.muted } },
    tooltip: {
      trigger: 'item',
      ...tooltipStyle(t),
      valueFormatter: (x) => (typeof x === 'number' ? `${formatNumber(x, 1)}% of squad best` : '–'),
    },
    radar: {
      center: ['50%', '56%'],
      radius: '74%',
      splitNumber: 4,
      indicator: attrs.map((attr) => ({ name: attr.shortLabel, min, max: 100 })),
      axisName: { color: t.muted, fontSize: 11 },
      axisLine: { lineStyle: { color: t.grid } },
      splitLine: { lineStyle: { color: t.grid } },
      splitArea: { show: false },
    },
    series: [
      {
        type: 'radar',
        data: [
          ...picks.map((p) => line(p.rider.name, of(p.rider), slotColor(t, p.slot), 'solid', true)),
          ...(show.mean ? [line('Squad Mean', squadMean, t.reference, 'dotted')] : []),
        ],
        emphasis: { focus: 'self' },
      },
    ],
  }
}

interface TableRow {
  id: string
  label: string
  rating: (r: Rider) => number | null
  decimals: number
}

const TABLE_ROWS: TableRow[] = [
  { id: 'ca', label: 'Current Ability', rating: (r) => r.caPa?.ca ?? null, decimals: 1 },
  { id: 'pa', label: 'Potential Ability (P50)', rating: (r) => r.caPa?.paP50 ?? null, decimals: 1 },
  ...ATTRIBUTES.map((attr) => ({
    id: attr.id,
    label: attr.label,
    rating: (r: Rider) => r.attributes[attr.id].rating,
    decimals: 0,
  })),
]

/**
 * One column per rider. Two riders get a Difference column (A − B); with three
 * or four, each row marks its best rider instead. Rows compare ratings when
 * everyone is rated, otherwise measured values; in the W view, power rows
 * compare watts (ratings stay on W/kg, KB §6).
 */
function HeadToHead({ picks, unit }: { picks: readonly Pick[]; unit: PowerUnit }) {
  const attrOf = (id: string) => ATTRIBUTES.find((x) => x.id === id)
  const valueOf = (r: Rider, id: string) =>
    attrOf(id) ? attributeValue(r, id as AttributeId, unit) : null
  const unitOf = (id: string) => (attrOf(id) ? attributeUnit(id as AttributeId, unit).unit : '')
  const valueDecimals = (id: string) =>
    attrOf(id) ? attributeUnit(id as AttributeId, unit).decimals : 0
  const valueText = (r: Rider, id: string) =>
    attrOf(id) ? `${formatNumber(valueOf(r, id), valueDecimals(id))} ${unitOf(id)}` : null
  const pair = picks.length === 2 ? picks : null

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="py-2 text-left font-normal">
              Attribute
            </th>
            {picks.map((p) => (
              <th key={p.slot} scope="col" className="py-2 pl-3 text-right font-normal">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={cn('size-2 rounded-full', SLOT_SWATCH[p.slot])}
                    aria-hidden="true"
                  />
                  {p.rider.name}
                </span>
              </th>
            ))}
            {pair && (
              <th scope="col" className="py-2 pl-3 text-right font-normal">
                Difference
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {TABLE_ROWS.map((row) => {
            const wattsRow = unit === 'w' && attrOf(row.id)?.secs !== undefined
            const rated = picks.map((p) => row.rating(p.rider))
            const byRating = rated.every((r) => r !== null) && !wattsRow
            const scores = picks.map(
              (p, i) => (byRating ? rated[i] : valueOf(p.rider, row.id)) ?? null,
            )
            const present = scores.filter((x): x is number => x !== null)
            const top = present.length > 1 ? Math.max(...present) : null
            const diff =
              pair && scores[0] != null && scores[1] != null ? scores[0] - scores[1] : null
            const diffUnit = byRating ? '' : unitOf(row.id)
            return (
              <tr key={row.id} className="border-b last:border-b-0">
                <th scope="row" className="py-1.5 text-left font-normal">
                  {row.label}
                </th>
                {picks.map((p, i) => {
                  // With three or four riders, the best of the row is highlighted.
                  const isTop = !pair && top !== null && scores[i] === top
                  return (
                    <td
                      key={p.slot}
                      className={cn(
                        'py-1.5 pl-3 text-right whitespace-nowrap',
                        isTop && 'bg-muted',
                      )}
                    >
                      <span
                        className={cn(
                          'mr-2 text-xs',
                          isTop ? 'font-semibold text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {valueText(p.rider, row.id)}
                      </span>
                      <RatingChip rating={rated[i] ?? null} decimals={row.decimals} />
                      {isTop && <span className="sr-only"> (best)</span>}
                    </td>
                  )
                })}
                {pair && (
                  <td
                    className={cn(
                      'py-1.5 pl-3 text-right font-medium',
                      diff !== null && diff > 0 && 'font-semibold text-rider-a-ink',
                      diff !== null && diff < 0 && 'font-semibold text-rider-b-ink',
                    )}
                  >
                    {diff === 0
                      ? '0'
                      : `${formatNumber(diff, byRating ? row.decimals : valueDecimals(row.id), true)}${diffUnit && diff !== null ? ` ${diffUnit}` : ''}`}
                    {diff !== null && diff !== 0 && (
                      <span className="sr-only">
                        {' '}
                        in favour of {diff > 0 ? pair[0]?.rider.name : pair[1]?.rider.name}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

type DurabilityEffort = 'p5mWkg' | 'p20mWkg'

function DurabilityBubbles({ picks }: { picks: readonly Pick[] }) {
  const t = useChartTokens()
  const [effort, setEffort] = useState<DurabilityEffort>('p5mWkg')
  const stageOf = (kj: number) => (kj === 0 ? 'Fresh' : `${String(kj)} kJ/kg`)
  const stages = [0, 10, 20, 30].map(stageOf)
  const withData = picks.filter((p) => p.rider.durability.length > 0)

  const option: EChartsOption = {
    grid: { left: 120, right: 24, top: 16, bottom: 32 },
    tooltip: {
      trigger: 'item',
      ...tooltipStyle(t),
      formatter: (p) => {
        const item = Array.isArray(p) ? p[0] : p
        const [stage, , pct] = (item?.value ?? []) as [string, string, number]
        return `${item?.seriesName ?? ''}<br/>${stage}: ${formatNumber(pct, 0)}% of fresh`
      },
    },
    xAxis: { type: 'category', data: stages, ...axisStyle(t), splitLine: { show: false } },
    yAxis: {
      type: 'category',
      data: withData.map((p) => p.rider.name).reverse(),
      ...axisStyle(t),
      splitLine: { show: false },
    },
    series: withData.map(({ rider, slot }) => {
      const fresh = rider.durability.find((d) => d.kjPerKg === 0)?.[effort] ?? 0
      return {
        name: rider.name,
        type: 'scatter' as const,
        data: rider.durability.map((d) => {
          const pct = retainedPct(fresh, d[effort]) ?? 0
          return [stageOf(d.kjPerKg), rider.name, pct]
        }),
        // Bubble area follows % retained.
        symbolSize: (v: [string, string, number]) => 40 * Math.sqrt(v[2] / 100),
        itemStyle: {
          color: slotColor(t, slot),
          opacity: 0.85,
          borderColor: t.surface,
          borderWidth: 2,
        },
        // Labels sit beside the bubble in ink: white fails contrast on yellow and green.
        label: {
          show: true,
          position: 'right' as const,
          formatter: (p: { value: unknown }) =>
            `${formatNumber((p.value as [string, string, number])[2], 0)}%`,
          color: t.text,
          fontSize: 10,
          fontWeight: 'bold',
        },
      }
    }),
  }

  return (
    <Panel title="Durability">
      <div className="flex gap-1" role="group" aria-label="Effort">
        {(
          [
            ['p5mWkg', '5 min'],
            ['p20mWkg', '20 min'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={effort === key}
            onClick={() => {
              setEffort(key)
            }}
            className={cn(
              'rounded-sm border px-2 py-0.5 text-xs',
              effort === key ? 'border-primary text-primary' : 'text-muted-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {withData.length === 0 ? (
        <p className="text-sm text-muted-foreground">No durability data for these riders yet.</p>
      ) : (
        <Chart
          option={option}
          height={70 + 50 * withData.length}
          label={`Durability: ${effort === 'p5mWkg' ? '5-min' : '20-min'} power retained after 10, 20 and 30 kJ/kg for ${withData.map((p) => p.rider.name).join(', ')}`}
        />
      )}
      <p className="text-xs text-muted-foreground">
        Bubble area and label: % of fresh power retained.
      </p>
    </Panel>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked)
        }}
        className="accent-primary"
      />
      {label}
    </label>
  )
}

export function ComparePage() {
  const { data: riders = [] } = useSquad()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const t = useChartTokens()
  const unit = usePowerUnit()
  const [show, setShow] = useState<References>({ mean: false, best: false, pro: false })

  // A and B always (defaulting to the first riders); C and D when added. No rider twice.
  const picks: Pick[] = []
  for (const slot of SLOTS) {
    const taken = picks.map((p) => p.rider.id)
    const chosen = riders.find((r) => r.id === search[slot] && !taken.includes(r.id))
    const fallback =
      slot === 'a' || slot === 'b' ? riders.find((r) => !taken.includes(r.id)) : undefined
    const rider = chosen ?? fallback
    if (rider) picks.push({ slot, rider })
  }
  const nextSlot = SLOTS.find((slot) => !picks.some((p) => p.slot === slot))
  const free = riders.find((r) => !picks.some((p) => p.rider.id === r.id))

  function select(slot: Slot, id: string) {
    void navigate({ search: (prev) => ({ ...prev, [slot]: id }), replace: true })
  }

  function remove(slot: Slot) {
    // Removing C moves D up, so the colours stay A, B, C, D in order.
    void navigate({
      search: (prev) =>
        slot === 'c' ? { ...prev, c: prev.d, d: undefined } : { ...prev, [slot]: undefined },
      replace: true,
    })
  }

  const names = picks.map((p) => p.rider.name).join(', ')

  return (
    <section aria-labelledby="page-title" className="space-y-4">
      <h1 id="page-title" className="text-2xl font-semibold">
        Compare
      </h1>

      {picks.length < 2 ? (
        <p className="text-sm text-muted-foreground">At least two riders are needed to compare.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {picks.map((p) => (
              <RiderPicker
                key={p.slot}
                slot={p.slot}
                value={p.rider.id}
                riders={riders}
                exclude={picks.filter((o) => o.slot !== p.slot).map((o) => o.rider.id)}
                onChange={(id) => {
                  select(p.slot, id)
                }}
                onRemove={
                  p.slot === 'c' || p.slot === 'd'
                    ? () => {
                        remove(p.slot)
                      }
                    : undefined
                }
              />
            ))}
            {nextSlot && free && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  select(nextSlot, free.id)
                }}
              >
                <Plus aria-hidden="true" />
                Add Rider
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Toggle
              label="Show Squad Mean"
              checked={show.mean}
              onChange={(mean) => {
                setShow((s) => ({ ...s, mean }))
              }}
            />
            <Toggle
              label="Show Squad Best"
              checked={show.best}
              onChange={(b) => {
                setShow((s) => ({ ...s, best: b }))
              }}
            />
            <Toggle
              label="Show Pro Mean"
              checked={show.pro}
              onChange={(pro) => {
                setShow((s) => ({ ...s, pro }))
              }}
            />
            <PowerUnitToggle />
          </div>

          {/* Three or four riders need the full width for the table. */}
          <div className={cn('grid gap-4', picks.length === 2 && 'lg:grid-cols-2')}>
            <Panel title="Attributes">
              {picks.some((p) => hasRatings(p.rider)) ? (
                <Chart
                  option={radarOption(t, picks, riders, show)}
                  height={360}
                  label={`Radar of ${names} on the 1–20 scale for the six power durations`}
                />
              ) : (
                <>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Best power over 84 days as a share of the squad best (100%), until 1–20 ratings
                    are calculated.
                  </p>
                  <Chart
                    option={valueRadarOption(t, picks, riders, unit, show)}
                    height={340}
                    label={`Radar of ${names}: best power as a percentage of the squad best`}
                  />
                </>
              )}
            </Panel>
            <Panel title="Head to Head">
              <HeadToHead picks={picks} unit={unit} />
            </Panel>
          </div>

          <DurabilityBubbles picks={picks} />
        </>
      )}
    </section>
  )
}
