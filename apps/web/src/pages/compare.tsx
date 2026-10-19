import { best, mean, retainedPct } from '@prolog/metrics'
import { getRouteApi } from '@tanstack/react-router'
import type { EChartsOption } from 'echarts'
import { useState } from 'react'
import { Chart } from '@/components/chart.tsx'
import { RatingChip } from '@/components/rating-chip.tsx'
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
import { Panel } from '@/pages/rider/panels.tsx'

const route = getRouteApi('/app/compare')

const RADAR_ATTRIBUTES = ATTRIBUTES.map((a) => a.id)

function ratings(rider: Rider): number[] {
  return RADAR_ATTRIBUTES.map((id) => rider.attributes[id].rating)
}

function squadSummary(riders: Rider[], summarise: typeof mean): number[] {
  return RADAR_ATTRIBUTES.map((id) => summarise(riders.map((r) => r.attributes[id].rating)) ?? 0)
}

function RiderPicker({
  label,
  value,
  riders,
  exclude,
  swatch,
  onChange,
}: {
  label: string
  value: string
  riders: Rider[]
  exclude: string
  swatch: string
  onChange: (id: string) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className={cn('size-3 rounded-full', swatch)} aria-hidden="true" />
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="w-56">
          <SelectValue placeholder="Choose a rider" />
        </SelectTrigger>
        <SelectContent>
          {riders.map((r) => (
            <SelectItem key={r.id} value={r.id} disabled={r.id === exclude}>
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

function radarOption(
  t: ChartTokens,
  a: Rider,
  b: Rider,
  squad: Rider[],
  showPro: boolean,
): EChartsOption {
  const line = (
    name: string,
    value: number[],
    color: string,
    type: 'solid' | 'dashed' | 'dotted',
    area = false,
  ) => ({
    name,
    value,
    symbol: 'circle',
    symbolSize: 6,
    lineStyle: { width: 2, color, type },
    itemStyle: { color },
    areaStyle: area ? { color, opacity: 0.12 } : undefined,
  })

  const data = [
    line(a.name, ratings(a), t.riderA, 'solid', true),
    line(b.name, ratings(b), t.riderB, 'dashed', true),
    line('Squad Mean', squadSummary(squad, mean), t.reference, 'dotted'),
    line('Squad Best', squadSummary(squad, best), t.series[0], 'dotted'),
    ...(showPro
      ? [
          line(
            'Pro Mean',
            RADAR_ATTRIBUTES.map(() => PRO_MEAN_RATING),
            t.series[1],
            'dashed',
          ),
        ]
      : []),
  ]

  return {
    legend: {
      top: 0,
      left: 0,
      textStyle: { color: t.muted },
      itemWidth: 16,
      itemHeight: 2,
    },
    tooltip: { trigger: 'item', ...tooltipStyle(t) },
    radar: {
      center: ['50%', '56%'],
      radius: '74%',
      splitNumber: 4,
      indicator: ATTRIBUTES.map((attr) => ({ name: attr.shortLabel, min: 0, max: 20 })),
      axisName: { color: t.muted, fontSize: 11 },
      axisLine: { lineStyle: { color: t.grid } },
      splitLine: { lineStyle: { color: t.grid } },
      splitArea: { show: false },
    },
    series: [{ type: 'radar', data, emphasis: { focus: 'self' } }],
  }
}

function DifferenceTable({ a, b }: { a: Rider; b: Rider }) {
  const rows: { id: string; label: string; ra: number; rb: number; decimals: number }[] = [
    { id: 'ca', label: 'Current Ability', ra: a.caPa.ca, rb: b.caPa.ca, decimals: 1 },
    { id: 'pa', label: 'Potential Ability (P50)', ra: a.caPa.paP50, rb: b.caPa.paP50, decimals: 1 },
    ...ATTRIBUTES.map((attr) => ({
      id: attr.id,
      label: attr.label,
      ra: a.attributes[attr.id].rating,
      rb: b.attributes[attr.id].rating,
      decimals: 0,
    })),
  ]
  const value = (r: Rider, id: string) => {
    if (id === 'ca' || id === 'pa') return null
    const attr = ATTRIBUTES.find((x) => x.id === id)
    const v = r.attributes[id as AttributeId].value
    return attr ? `${formatNumber(v, attr.unit === 'W/kg' ? 2 : 0)} ${attr.unit}` : null
  }

  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr className="border-b">
          <th scope="col" className="py-2 text-left font-normal">
            Attribute
          </th>
          <th scope="col" className="py-2 text-right font-normal">
            {a.name}
          </th>
          <th scope="col" className="py-2 text-right font-normal">
            {b.name}
          </th>
          <th scope="col" className="py-2 text-right font-normal">
            Difference
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const diff = row.ra - row.rb
          return (
            <tr key={row.id} className="border-b last:border-b-0">
              <th scope="row" className="py-1.5 text-left font-normal">
                {row.label}
              </th>
              <td className="py-1.5 text-right">
                <span className="mr-2 text-xs text-muted-foreground">{value(a, row.id)}</span>
                <RatingChip rating={row.ra} decimals={row.decimals} />
              </td>
              <td className="py-1.5 text-right">
                <span className="mr-2 text-xs text-muted-foreground">{value(b, row.id)}</span>
                <RatingChip rating={row.rb} decimals={row.decimals} />
              </td>
              <td
                className={cn(
                  'py-1.5 text-right font-medium',
                  diff > 0 && 'text-gold',
                  diff < 0 && 'text-cream',
                )}
              >
                {diff === 0 ? '0' : formatNumber(diff, row.decimals, true)}
                {diff !== 0 && (
                  <span className="sr-only"> in favour of {diff > 0 ? a.name : b.name}</span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

type DurabilityEffort = 'p5mWkg' | 'p20mWkg'

function DurabilityBubbles({ a, b }: { a: Rider; b: Rider }) {
  const t = useChartTokens()
  const [effort, setEffort] = useState<DurabilityEffort>('p5mWkg')
  const riders = [
    { rider: a, color: t.riderA },
    { rider: b, color: t.riderB },
  ]
  const stages = a.durability.map((d) => (d.kjPerKg === 0 ? 'Fresh' : `${d.kjPerKg} kJ/kg`))

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
      data: riders.map((r) => r.rider.name).reverse(),
      ...axisStyle(t),
      splitLine: { show: false },
    },
    series: riders.map(({ rider, color }) => {
      const fresh = rider.durability.find((d) => d.kjPerKg === 0)?.[effort] ?? 0
      return {
        name: rider.name,
        type: 'scatter' as const,
        data: rider.durability.map((d) => {
          const pct = retainedPct(fresh, d[effort]) ?? 0
          return [d.kjPerKg === 0 ? 'Fresh' : `${d.kjPerKg} kJ/kg`, rider.name, pct]
        }),
        // Bubble area follows % retained.
        symbolSize: (v: [string, string, number]) => 44 * Math.sqrt(v[2] / 100),
        itemStyle: { color, opacity: 0.85, borderColor: t.surface, borderWidth: 2 },
        label: {
          show: true,
          formatter: (p: { value: unknown }) =>
            `${formatNumber((p.value as [string, string, number])[2], 0)}%`,
          color: t.surface,
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
              effort === key ? 'border-gold text-gold' : 'text-muted-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <Chart
        option={option}
        height={170}
        label={`Durability: ${effort === 'p5mWkg' ? '5-min' : '20-min'} power retained after 10, 20 and 30 kJ/kg for ${a.name} and ${b.name}`}
      />
      <p className="text-xs text-muted-foreground">
        Bubble area and label: % of fresh power retained.
      </p>
    </Panel>
  )
}

export function ComparePage() {
  const { data: riders = [] } = useSquad()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const t = useChartTokens()
  const [showPro, setShowPro] = useState(false)

  const a = riders.find((r) => r.id === search.a) ?? riders[0]
  const b =
    riders.find((r) => r.id === search.b && r.id !== a?.id) ?? riders.find((r) => r.id !== a?.id)

  function select(side: 'a' | 'b', id: string) {
    void navigate({ search: (prev) => ({ ...prev, [side]: id }), replace: true })
  }

  return (
    <section aria-labelledby="page-title" className="space-y-4">
      <h1 id="page-title" className="text-2xl font-semibold">
        Compare
      </h1>

      {!a || !b ? (
        <p className="text-sm text-muted-foreground">At least two riders are needed to compare.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-6">
            <RiderPicker
              label="Rider A"
              value={a.id}
              riders={riders}
              exclude={b.id}
              swatch="bg-rider-a"
              onChange={(id) => {
                select('a', id)
              }}
            />
            <RiderPicker
              label="Rider B"
              value={b.id}
              riders={riders}
              exclude={a.id}
              swatch="bg-rider-b"
              onChange={(id) => {
                select('b', id)
              }}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showPro}
                onChange={(e) => {
                  setShowPro(e.target.checked)
                }}
                className="accent-gold"
              />
              Show Pro Mean
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Attributes">
              <Chart
                option={radarOption(t, a, b, riders, showPro)}
                height={360}
                label={`Radar of ${a.name} and ${b.name} against the squad mean and squad best, on the 1–20 scale`}
              />
            </Panel>
            <Panel title="Head to Head">
              <DifferenceTable a={a} b={b} />
            </Panel>
          </div>

          <DurabilityBubbles a={a} b={b} />
        </>
      )}
    </section>
  )
}
