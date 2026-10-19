import { retainedPct } from '@prolog/metrics'
import type { EChartsOption } from 'echarts'
import { Chart } from '@/components/chart.tsx'
import { axisStyle, tooltipStyle, useChartTokens } from '@/lib/chart-theme.ts'
import { POWER_WINDOW_LABELS } from '@/data/labels.ts'
import { MOCK_PRO_MEAN_WKG } from '@/data/mock/benchmarks.ts'
import type { PowerWindow, Rider } from '@/data/types.ts'
import { formatDuration } from '@/lib/duration.ts'
import { formatNumber } from '@/lib/format.ts'
import { Panel } from '@/pages/rider/panels.tsx'

// 84 days is the rating window (KB §6), so it leads and takes the first series colour.
const WINDOW_ORDER: readonly PowerWindow[] = ['84d', 'season', '42d']

export function PowerCurveChart({ rider }: { rider: Rider }) {
  const t = useChartTokens()
  const curves = WINDOW_ORDER.flatMap((w) => rider.powerCurves.filter((c) => c.window === w))

  const option: EChartsOption = {
    grid: { left: 48, right: 24, top: 56, bottom: 40 },
    legend: { top: 0, left: 0, textStyle: { color: t.muted }, itemWidth: 16, itemHeight: 2 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: t.muted } },
      ...tooltipStyle(t),
      valueFormatter: (v) => (typeof v === 'number' ? `${formatNumber(v, 2)} W/kg` : '–'),
    },
    xAxis: {
      type: 'log',
      logBase: 10,
      min: 1,
      max: 3600,
      name: 'Duration',
      nameLocation: 'middle',
      nameGap: 26,
      ...axisStyle(t),
      splitLine: { show: false },
      // Ticks at the rated durations (KB §6) instead of powers of ten.
      axisLabel: {
        ...axisStyle(t).axisLabel,
        customValues: [5, 30, 60, 300, 1200, 3600],
        formatter: (v: number) => formatDuration(v),
      },
      axisTick: {
        show: true,
        customValues: [5, 30, 60, 300, 1200, 3600],
        lineStyle: { color: t.grid },
      },
    },
    yAxis: {
      type: 'value',
      name: 'W/kg',
      min: 0,
      ...axisStyle(t),
    },
    series: [
      ...curves.map((c, i) => ({
        name: POWER_WINDOW_LABELS[c.window],
        type: 'line' as const,
        data: c.secs.map((s, j) => [s, c.wkg[j] ?? null]),
        showSymbol: false,
        symbolSize: 8,
        lineStyle: { width: 2, color: t.series[i] },
        itemStyle: { color: t.series[i] },
        emphasis: { focus: 'series' as const },
      })),
      {
        name: 'Pro Mean',
        type: 'line' as const,
        data: MOCK_PRO_MEAN_WKG.map((p) => [p.secs, p.wkg]),
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { width: 2, type: 'dashed', color: t.reference },
        itemStyle: { color: t.reference, borderColor: t.surface, borderWidth: 2 },
      },
    ],
  }

  const secs = curves[0]?.secs ?? []
  return (
    <Panel title="Power–Duration Curve">
      <Chart
        option={option}
        height={300}
        label={`Power–duration curve for ${rider.name}: season, 84 days and 42 days, with the pro mean`}
        table={
          <table className="text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="pr-4 text-left font-normal">
                  Duration
                </th>
                {curves.map((c) => (
                  <th key={c.window} scope="col" className="pr-4 text-right font-normal">
                    {POWER_WINDOW_LABELS[c.window]} (W/kg)
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {secs.map((s, j) => (
                <tr key={s}>
                  <th scope="row" className="pr-4 text-left font-normal">
                    {formatDuration(s)}
                  </th>
                  {curves.map((c) => (
                    <td key={c.window} className="pr-4 text-right">
                      {formatNumber(c.wkg[j] ?? 0, 2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
      <p className="text-xs text-muted-foreground">
        Pro mean: the rating-15 points of the Female Pro + Coggan provisional benchmark (KB §6).
      </p>
    </Panel>
  )
}

export function DurabilityFunnel({ rider }: { rider: Rider }) {
  const t = useChartTokens()
  const points = rider.durability
  const fresh = points.find((d) => d.kjPerKg === 0)
  const categories = points.map((d) => (d.kjPerKg === 0 ? 'Fresh' : `${d.kjPerKg} kJ/kg`))
  const series = [
    { name: '5 min', key: 'p5mWkg' as const },
    { name: '20 min', key: 'p20mWkg' as const },
  ]

  const option: EChartsOption = {
    grid: { left: 48, right: 72, top: 56, bottom: 32 },
    legend: { top: 0, left: 0, textStyle: { color: t.muted }, itemWidth: 16, itemHeight: 2 },
    tooltip: {
      trigger: 'axis',
      ...tooltipStyle(t),
      valueFormatter: (v) => (typeof v === 'number' ? `${formatNumber(v, 2)} W/kg` : '–'),
    },
    xAxis: {
      type: 'category',
      data: categories,
      boundaryGap: false,
      ...axisStyle(t),
      splitLine: { show: false },
    },
    yAxis: { type: 'value', name: 'W/kg', scale: true, ...axisStyle(t) },
    series: series.map((s, i) => ({
      name: s.name,
      type: 'line' as const,
      data: points.map((d) => d[s.key]),
      symbolSize: 8,
      lineStyle: { width: 2, color: t.series[i] },
      itemStyle: { color: t.series[i], borderColor: t.surface, borderWidth: 2 },
      // Direct label at the end: retained % after 30 kJ/kg.
      endLabel: {
        show: true,
        color: t.muted,
        fontSize: 11,
        formatter: () => {
          const last = points.at(-1)
          const pct = fresh && last ? retainedPct(fresh[s.key], last[s.key]) : null
          return pct === null ? s.name : `${s.name} ${formatNumber(pct, 0)}%`
        },
      },
    })),
  }

  return (
    <Panel title="Durability Funnel">
      <Chart
        option={option}
        height={240}
        label={`Durability funnel for ${rider.name}: best 5-min and 20-min power fresh and after 10, 20 and 30 kJ/kg`}
      />
      <p className="text-xs text-muted-foreground">
        Best power in the last 84 days after accumulated work.
      </p>
    </Panel>
  )
}
