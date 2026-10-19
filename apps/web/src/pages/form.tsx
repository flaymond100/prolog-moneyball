import { Link } from '@tanstack/react-router'
import type { EChartsOption } from 'echarts'
import { CalendarDays } from 'lucide-react'
import { Chart } from '@/components/chart.tsx'
import { ReadinessLight } from '@/components/readiness-light.tsx'
import { Sparkline } from '@/components/sparkline.tsx'
import { MOCK_READINESS_PRIORS } from '@/data/mock/priors.ts'
import { useSquad } from '@/data/queries.ts'
import type { Rider } from '@/data/types.ts'
import { axisStyle, tooltipStyle, useChartTokens } from '@/lib/chart-theme.ts'
import { formatDate, formatNumber } from '@/lib/format.ts'

const { lnRmssdBandSd, minHrvReadings7d: MIN_HRV_READINGS } = MOCK_READINESS_PRIORS

function LnRmssdBand({ rider }: { rider: Rider }) {
  const t = useChartTokens()
  const { lnRmssd7d, baselineMean, baselineSd } = rider.form
  // Readiness band (KB §9): 7-day ln rMSSD within baseline ± the prior SD multiple.
  const lower = baselineMean - lnRmssdBandSd * baselineSd
  const upper = baselineMean + lnRmssdBandSd * baselineSd

  const option: EChartsOption = {
    grid: { left: 36, right: 8, top: 8, bottom: 20 },
    tooltip: {
      trigger: 'axis',
      ...tooltipStyle(t),
      valueFormatter: (v) => (typeof v === 'number' ? formatNumber(v, 2) : '–'),
    },
    xAxis: {
      type: 'category',
      data: lnRmssd7d.map((d) => d.date),
      ...axisStyle(t),
      axisLabel: {
        ...axisStyle(t).axisLabel,
        interval: 6,
        formatter: (v: string) => formatDate(v).split(' ').slice(0, 2).join(' '),
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      // Show the whole band with room above and below it.
      min: (v: { min: number }) => Math.min(v.min, lower) - baselineSd,
      max: (v: { max: number }) => Math.max(v.max, upper) + baselineSd,
      ...axisStyle(t),
      axisLabel: { ...axisStyle(t).axisLabel, formatter: (v: number) => formatNumber(v, 2) },
    },
    series: [
      {
        name: '7-Day ln rMSSD',
        type: 'line',
        data: lnRmssd7d.map((d) => d.value),
        showSymbol: false,
        lineStyle: { width: 2, color: t.series[0] },
        itemStyle: { color: t.series[0] },
        markArea: {
          silent: true,
          itemStyle: { color: 'rgb(184 173 154 / 0.14)' },
          data: [[{ yAxis: lower }, { yAxis: upper }]],
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: t.reference, type: 'dashed', width: 1 },
          label: { show: false },
          data: [{ yAxis: baselineMean }],
        },
      },
    ],
  }

  return (
    <Chart
      option={option}
      height={130}
      label={`7-day ln rMSSD for ${rider.name} over 28 days against the baseline band ${formatNumber(lower, 2)} to ${formatNumber(upper, 2)}`}
    />
  )
}

function FormCard({ rider }: { rider: Rider }) {
  const { readiness, training, form } = rider
  const insufficient = form.hrvReadings7d < MIN_HRV_READINGS
  const light = insufficient ? 'grey' : readiness.light
  const first = form.eftpWkg[0]
  const last = form.eftpWkg.at(-1)

  return (
    <article
      aria-labelledby={`form-${rider.id}`}
      className="space-y-3 rounded-md border bg-card p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`form-${rider.id}`} className="font-semibold">
            <Link
              to="/riders/$riderId"
              params={{ riderId: rider.id }}
              className="hover:text-primary"
            >
              {rider.name}
            </Link>
          </h2>
          <ReadinessLight light={light} className="text-sm" />
          {!insufficient && readiness.reasons.length > 0 && (
            <p className="text-xs text-muted-foreground">{readiness.reasons.join(', ')}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">TSB</p>
          <p className="text-2xl font-semibold">{formatNumber(training.tsb, 0, true)}</p>
          <p className="text-xs text-muted-foreground">
            CTL {formatNumber(training.ctl)} · ATL {formatNumber(training.atl)}
          </p>
        </div>
      </header>

      <section aria-label="HRV" className="space-y-1">
        <p className="text-xs text-muted-foreground">
          7-day ln rMSSD · band = baseline ± {lnRmssdBandSd} SD · {form.hrvReadings7d} readings in 7
          days
        </p>
        {insufficient ? (
          <p className="rounded-sm border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            Insufficient HRV data: fewer than {MIN_HRV_READINGS} readings in the last 7 days.
          </p>
        ) : (
          <LnRmssdBand rider={rider} />
        )}
      </section>

      <div className="flex flex-wrap items-end justify-between gap-4 border-t pt-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">eFTP (8 Weeks)</p>
          <div className="flex items-center gap-2">
            <Sparkline
              values={form.eftpWkg}
              label={`eFTP over 8 weeks: ${formatNumber(first?.value ?? 0, 2)} to ${formatNumber(last?.value ?? 0, 2)} W/kg`}
            />
            <span className="text-sm font-medium">{formatNumber(last?.value ?? 0, 2)} W/kg</span>
          </div>
        </div>
        <div className="space-y-1 text-right">
          <p className="text-xs text-muted-foreground">Next Race</p>
          {form.nextRace ? (
            <>
              <p className="flex items-center justify-end gap-1.5 text-sm font-medium">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {form.nextRace.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDate(form.nextRace.date)} · projected TSB{' '}
                <span className="font-medium text-foreground">
                  {formatNumber(form.nextRace.projectedTsb, 0, true)}
                </span>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">None planned</p>
          )}
        </div>
      </div>
    </article>
  )
}

export function FormPage() {
  const { data: riders = [] } = useSquad()
  return (
    <section aria-labelledby="page-title" className="space-y-4">
      <h1 id="page-title" className="text-2xl font-semibold">
        Form
      </h1>
      <p className="text-sm text-muted-foreground">
        Readiness: green when every marker is in band, amber with one out, red with two or more out
        for two or more days. ACWR is not used for alerts.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {riders.map((r) => (
          <FormCard key={r.id} rider={r} />
        ))}
      </div>
    </section>
  )
}
