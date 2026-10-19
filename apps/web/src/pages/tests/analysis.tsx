import { isMeaningfulChange, mean } from '@prolog/metrics'
import { Link } from '@tanstack/react-router'
import type { EChartsOption } from 'echarts'
import { useState } from 'react'
import { Chart } from '@/components/chart.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { TRACKED_LAB_METRICS } from '@/data/lab-ranges.ts'
import type { LabTest, Rider } from '@/data/types.ts'
import { useTypicalErrors } from '@/data/typical-error-store.ts'
import { axisStyle, tooltipStyle, useChartTokens } from '@/lib/chart-theme.ts'
import { formatDate, formatNumber } from '@/lib/format.ts'
import { Panel } from '@/pages/rider/panels.tsx'

type MetricKey = (typeof TRACKED_LAB_METRICS)[number]['key']

function decimalsFor(step: number): number {
  return step >= 1 ? 0 : step >= 0.1 ? 1 : 2
}

function valuesOf(rider: Rider, key: MetricKey): { test: LabTest; value: number }[] {
  return rider.labTests.flatMap((test) => {
    const value = test[key]
    return value === null || value === undefined ? [] : [{ test, value }]
  })
}

export function SlopeChart({ riders }: { riders: Rider[] }) {
  const t = useChartTokens()
  const [key, setKey] = useState<MetricKey>('vo2maxMlKgMin')
  const metric = TRACKED_LAB_METRICS.find((m) => m.key === key) ?? TRACKED_LAB_METRICS[0]
  const decimals = decimalsFor(metric?.step ?? 1)

  // Colour follows the rider (fixed order), never the rank.
  const lines = riders.flatMap((rider, i) => {
    const vs = valuesOf(rider, key)
    const first = vs[0]
    const last = vs.at(-1)
    return first && last && vs.length >= 2 ? [{ rider, first, last, color: t.series[i % 5] }] : []
  })

  const option: EChartsOption = {
    grid: { left: 56, right: 140, top: 16, bottom: 32 },
    tooltip: { trigger: 'item', ...tooltipStyle(t) },
    xAxis: {
      type: 'category',
      data: ['First Test', 'Latest Test'],
      boundaryGap: false,
      ...axisStyle(t),
      splitLine: { show: false },
    },
    yAxis: { type: 'value', scale: true, name: metric?.unit, ...axisStyle(t) },
    series: lines.map((l) => ({
      name: l.rider.name,
      type: 'line' as const,
      data: [l.first.value, l.last.value],
      symbolSize: 8,
      lineStyle: { width: 2, color: l.color },
      itemStyle: { color: l.color, borderColor: t.surface, borderWidth: 2 },
      endLabel: {
        show: true,
        color: t.muted,
        fontSize: 11,
        formatter: `${l.rider.name} ${formatNumber(l.last.value - l.first.value, decimals, true)}`,
      },
    })),
  }

  return (
    <Panel title="Change Between Tests">
      <label className="flex items-center gap-2 text-sm">
        Metric
        <select
          value={key}
          onChange={(e) => {
            setKey(e.target.value as MetricKey)
          }}
          className="h-8 rounded-md border bg-transparent px-2 text-sm"
        >
          {TRACKED_LAB_METRICS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No rider has two tests with this metric yet.
        </p>
      ) : (
        <Chart
          option={option}
          height={240}
          label={`Slope chart of ${metric?.label ?? ''} from first to latest test for ${String(lines.length)} riders`}
        />
      )}
    </Panel>
  )
}

export function DeltaTable({ riders }: { riders: Rider[] }) {
  const typicalErrors = useTypicalErrors()
  return (
    <Panel title="Delta Table">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="py-2 text-left font-normal">
                Rider
              </th>
              {TRACKED_LAB_METRICS.map((m) => {
                const te = typicalErrors[m.key]
                return (
                  <th key={m.key} scope="col" className="py-2 text-right font-normal">
                    <span className="block whitespace-nowrap">
                      {m.shortLabel} ({m.unit})
                    </span>
                    <span className="block whitespace-nowrap" title="Typical error">
                      TE {te === undefined ? 'not set' : String(te)}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {riders.map((rider) => (
              <tr key={rider.id} className="border-b last:border-b-0">
                <th scope="row" className="py-2 text-left font-normal">
                  {rider.name}
                </th>
                {TRACKED_LAB_METRICS.map((m) => {
                  const vs = valuesOf(rider, m.key)
                  const first = vs[0]
                  const last = vs.at(-1)
                  if (!first || !last || vs.length < 2) {
                    return (
                      <td key={m.key} className="py-2 text-right text-muted-foreground">
                        –
                      </td>
                    )
                  }
                  const change = last.value - first.value
                  const meaningful = isMeaningfulChange(change, typicalErrors[m.key] ?? null)
                  return (
                    <td key={m.key} className="py-2 text-right">
                      <span className="block font-medium">
                        {formatNumber(change, decimalsFor(m.step), true)} {m.unit}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {meaningful === null
                          ? 'Not judged'
                          : meaningful
                            ? 'Meaningful'
                            : 'Within typical error'}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Change from first to latest test. A change counts only when it exceeds the typical error the
        coach sets per metric in{' '}
        <Link to="/settings" className="text-primary underline-offset-2 hover:underline">
          Settings
        </Link>
        .
      </p>
    </Panel>
  )
}

export function Vo2VlaQuadrant({ riders }: { riders: Rider[] }) {
  const t = useChartTokens()
  const points = riders.flatMap((rider, i) => {
    const latest = rider.labTests.at(-1)
    const x = latest?.vlamaxMmolLS
    const y = latest?.vo2maxMlKgMin
    return latest && x != null && y != null
      ? [
          {
            rider,
            x,
            y,
            modelled: latest.method === 'inscyd_ppd_field',
            date: latest.date,
            color: t.series[i % 5],
          },
        ]
      : []
  })
  const mx = mean(points.map((p) => p.x))
  const my = mean(points.map((p) => p.y))

  const option: EChartsOption = {
    grid: { left: 56, right: 24, top: 24, bottom: 48 },
    tooltip: {
      trigger: 'item',
      ...tooltipStyle(t),
      formatter: (p) => {
        const item = Array.isArray(p) ? p[0] : p
        const d = item?.data as
          { name: string; value: [number, number]; date: string; modelled: boolean } | undefined
        if (!d) return ''
        return `<strong>${d.name}</strong>${d.modelled ? ' (modelled)' : ''}<br/>VLamax ${formatNumber(d.value[0], 2)} mmol/L/s<br/>VO2max ${formatNumber(d.value[1], 1)} mL/kg/min<br/>${formatDate(d.date)}`
      },
    },
    xAxis: {
      type: 'value',
      min: (v: { min: number; max: number }) => v.min - (v.max - v.min || 1) * 0.2,
      max: (v: { min: number; max: number }) => v.max + (v.max - v.min || 1) * 0.35,
      name: 'VLamax (mmol/L/s)',
      nameLocation: 'middle',
      nameGap: 28,
      ...axisStyle(t),
    },
    yAxis: {
      type: 'value',
      min: (v: { min: number; max: number }) => v.min - (v.max - v.min || 1) * 0.2,
      max: (v: { min: number; max: number }) => v.max + (v.max - v.min || 1) * 0.2,
      name: 'VO2max (mL/kg/min)',
      nameLocation: 'middle',
      nameGap: 40,
      ...axisStyle(t),
    },
    series: [
      {
        type: 'scatter',
        symbolSize: 14,
        data: points.map((p) => ({
          name: p.rider.name,
          value: [p.x, p.y],
          date: p.date,
          modelled: p.modelled,
          itemStyle: { color: p.color, borderColor: t.surface, borderWidth: 2 },
        })),
        label: {
          show: true,
          position: 'right',
          color: t.muted,
          fontSize: 11,
          formatter: (p: { name: string; data: unknown }) =>
            `${p.name}${(p.data as { modelled: boolean }).modelled ? ' (modelled)' : ''}`,
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: t.reference, type: 'dashed', width: 1 },
          label: {
            color: t.muted,
            fontSize: 10,
            formatter: 'Squad mean',
            position: 'insideEndTop',
          },
          data: [...(mx === null ? [] : [{ xAxis: mx }]), ...(my === null ? [] : [{ yAxis: my }])],
        },
      },
    ],
  }

  return (
    <Panel title="VO2max × VLamax">
      <Chart
        option={option}
        height={300}
        label={`Latest VO2max against VLamax for ${String(points.length)} riders with squad-mean quadrant lines`}
      />
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        Latest test per rider. <Badge variant="secondary">Modelled</Badge> marks INSCYD field tests.
      </p>
    </Panel>
  )
}
