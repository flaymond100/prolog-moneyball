import { mean } from '@prolog/metrics'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import type { EChartsOption } from 'echarts'
import { Chart } from '@/components/chart.tsx'
import { FilterBuilder } from '@/components/filter-builder.tsx'
import { matchesAll, useFilterState } from '@/data/filter-store.ts'
import { RIDER_TYPE_LABELS, RIDER_TYPES } from '@/data/labels.ts'
import { METRICS, metricDef, metricLabel, requireMetric } from '@/data/metric-registry.ts'
import { useSquad } from '@/data/queries.ts'
import type { Rider } from '@/data/types.ts'
import { axisStyle, tooltipStyle, useChartTokens } from '@/lib/chart-theme.ts'
import { formatNumber } from '@/lib/format.ts'
import { primaryType } from '@/lib/rider.ts'
import { cn } from '@/lib/utils.ts'

const route = getRouteApi('/app/scatter')

const SCATTER_DEFAULTS = { x: 'p20mValue', y: 'p5sValue' }

const control =
  'h-8 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

const GROUPS = [...new Set(METRICS.map((m) => m.group))]

function MetricSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (id: string) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      {label}
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        className={cn(control, 'max-w-72')}
      >
        {GROUPS.map((g) => (
          <optgroup key={g} label={g}>
            {METRICS.filter((m) => m.group === g).map((m) => (
              <option key={m.id} value={m.id}>
                {metricLabel(m)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

interface Point {
  rider: Rider
  x: number
  y: number
  ctl: number
}

// 15% headroom so edge points and their labels are not clipped.
function pad(range: { min: number; max: number }): number {
  return range.max === range.min ? Math.abs(range.max) * 0.1 || 1 : (range.max - range.min) * 0.15
}

// Point area follows CTL: 14 px at the squad minimum, 36 px at the maximum.
function sizeScale(points: Point[]): (ctl: number) => number {
  const ctls = points.map((p) => p.ctl)
  const lo = Math.min(...ctls)
  const hi = Math.max(...ctls)
  return (ctl) => (hi === lo ? 24 : 14 + 22 * Math.sqrt((ctl - lo) / (hi - lo)))
}

export function ScatterPage() {
  const { data: riders = [] } = useSquad()
  const { conditions } = useFilterState()
  const search = route.useSearch()
  const navigate = useNavigate()
  const t = useChartTokens()

  const xDef = metricDef(search.x ?? '') ?? requireMetric(SCATTER_DEFAULTS.x)
  const yDef = metricDef(search.y ?? '') ?? requireMetric(SCATTER_DEFAULTS.y)

  const shown = riders.filter((r) => matchesAll(r, conditions))
  const points: Point[] = shown.flatMap((rider) => {
    const x = xDef.get(rider)
    const y = yDef.get(rider)
    return x === null || y === null ? [] : [{ rider, x, y, ctl: rider.training.ctl }]
  })
  const size = sizeScale(points)
  const meanX = mean(points.map((p) => p.x))
  const meanY = mean(points.map((p) => p.y))

  function setAxis(axis: 'x' | 'y', id: string) {
    void navigate({ to: '/scatter', search: (prev) => ({ ...prev, [axis]: id }), replace: true })
  }

  // One series per rider type, in fixed order, so colour follows the type and never the rank.
  const series = RIDER_TYPES.map((type, i) => ({
    name: RIDER_TYPE_LABELS[type],
    type: 'scatter' as const,
    data: points
      .filter((p) => primaryType(p.rider) === type)
      .map((p) => ({
        value: [p.x, p.y],
        name: p.rider.name,
        riderId: p.rider.id,
        ctl: p.ctl,
        symbolSize: size(p.ctl),
      })),
    itemStyle: { color: t.series[i], opacity: 0.9, borderColor: t.surface, borderWidth: 2 },
    label: {
      show: true,
      position: 'right' as const,
      formatter: '{b}',
      color: t.muted,
      fontSize: 11,
    },
    emphasis: { scale: 1.1 },
  }))

  const quadrant = {
    name: 'Squad Mean',
    type: 'scatter' as const,
    data: [],
    markLine: {
      silent: true,
      symbol: 'none',
      lineStyle: { color: t.reference, type: 'dashed' as const, width: 1 },
      label: {
        color: t.muted,
        fontSize: 10,
        formatter: 'Squad mean',
        position: 'insideEndTop' as const,
      },
      data: [
        ...(meanX === null ? [] : [{ xAxis: meanX }]),
        ...(meanY === null ? [] : [{ yAxis: meanY }]),
      ],
    },
  }

  const sliderStyle = {
    fillerColor: 'rgb(226 187 122 / 0.12)',
    borderColor: t.grid,
    backgroundColor: 'transparent',
    handleStyle: { color: t.muted, borderColor: t.surface },
    moveHandleStyle: { color: t.grid },
    showDataShadow: false,
    textStyle: { color: t.muted },
  }

  const option: EChartsOption = {
    grid: { left: 64, right: 72, top: 48, bottom: 72 },
    legend: {
      top: 0,
      left: 0,
      textStyle: { color: t.muted },
      data: RIDER_TYPES.map((type) => RIDER_TYPE_LABELS[type]),
    },
    tooltip: {
      trigger: 'item',
      ...tooltipStyle(t),
      formatter: (p) => {
        const item = Array.isArray(p) ? p[0] : p
        const d = item?.data as { name: string; value: [number, number]; ctl: number } | undefined
        if (!d) return ''
        return [
          `<strong>${d.name}</strong> · ${item?.seriesName ?? ''}`,
          `${xDef.label}: ${formatNumber(d.value[0], xDef.decimals)} ${xDef.unit}`,
          `${yDef.label}: ${formatNumber(d.value[1], yDef.decimals)} ${yDef.unit}`,
          `CTL: ${formatNumber(d.ctl)}`,
        ].join('<br/>')
      },
    },
    xAxis: {
      type: 'value',
      min: (v: { min: number; max: number }) => v.min - pad(v),
      max: (v: { min: number; max: number }) => v.max + pad(v),
      name: metricLabel(xDef),
      nameLocation: 'middle',
      nameGap: 28,
      ...axisStyle(t),
      axisLabel: {
        ...axisStyle(t).axisLabel,
        showMinLabel: false,
        showMaxLabel: false,
        formatter: (v: number) => formatNumber(v, xDef.decimals),
      },
    },
    yAxis: {
      type: 'value',
      min: (v: { min: number; max: number }) => v.min - pad(v),
      max: (v: { min: number; max: number }) => v.max + pad(v),
      name: metricLabel(yDef),
      nameLocation: 'middle',
      nameGap: 44,
      ...axisStyle(t),
      axisLabel: {
        ...axisStyle(t).axisLabel,
        showMinLabel: false,
        showMaxLabel: false,
        formatter: (v: number) => formatNumber(v, yDef.decimals),
      },
    },
    // Min/max sliders on both axes (KB §12).
    dataZoom: [
      {
        type: 'slider',
        xAxisIndex: 0,
        bottom: 8,
        height: 16,
        filterMode: 'none',
        ...sliderStyle,
      },
      {
        type: 'slider',
        yAxisIndex: 0,
        right: 16,
        width: 16,
        filterMode: 'none',
        ...sliderStyle,
      },
    ],
    series: [...series, quadrant],
  }

  return (
    <section aria-labelledby="page-title" className="space-y-4">
      <h1 id="page-title" className="text-2xl font-semibold">
        Scatter
      </h1>

      <FilterBuilder matched={shown.length} total={riders.length} />

      <div className="flex flex-wrap items-center gap-4">
        <MetricSelect
          label="X Axis"
          value={xDef.id}
          onChange={(id) => {
            setAxis('x', id)
          }}
        />
        <MetricSelect
          label="Y Axis"
          value={yDef.id}
          onChange={(id) => {
            setAxis('y', id)
          }}
        />
        <span className="text-xs text-muted-foreground">
          Point size: CTL · colour: rider type · click a rider to open the profile
        </span>
      </div>

      <div className="rounded-md border bg-card p-4">
        <Chart
          option={option}
          height={520}
          label={`Scatter of ${xDef.label} against ${yDef.label} for ${String(points.length)} riders`}
          onClick={(params) => {
            const id = (params.data as { riderId?: string } | undefined)?.riderId
            if (id) void navigate({ to: '/riders/$riderId', params: { riderId: id } })
          }}
          table={
            <table className="text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="pr-4 text-left font-normal">
                    Rider
                  </th>
                  <th scope="col" className="pr-4 text-right font-normal">
                    {metricLabel(xDef)}
                  </th>
                  <th scope="col" className="pr-4 text-right font-normal">
                    {metricLabel(yDef)}
                  </th>
                  <th scope="col" className="pr-4 text-right font-normal">
                    CTL
                  </th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.rider.id}>
                    <th scope="row" className="pr-4 text-left font-normal">
                      {p.rider.name}
                    </th>
                    <td className="pr-4 text-right">{formatNumber(p.x, xDef.decimals)}</td>
                    <td className="pr-4 text-right">{formatNumber(p.y, yDef.decimals)}</td>
                    <td className="pr-4 text-right">{formatNumber(p.ctl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        />
      </div>
    </section>
  )
}
