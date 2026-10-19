import { retainedPct } from '@prolog/metrics'
import type { ReactNode } from 'react'
import { ChangeArrow } from '@/components/change-arrow.tsx'
import { RatingChip } from '@/components/rating-chip.tsx'
import { ReadinessLight } from '@/components/readiness-light.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { attributeMeta, POWER_ATTRIBUTES, RIDER_TYPE_TERRAIN } from '@/data/labels.ts'
import type { AttributeId, Rider } from '@/data/types.ts'
import { formatDate, formatNumber, formatPercent } from '@/lib/format.ts'

export function Panel({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  const id = `panel-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`
  return (
    <section
      aria-labelledby={id}
      className={`space-y-3 rounded-md border bg-card p-4 ${className ?? ''}`}
    >
      <h2 id={id} className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

function AttributeRow({
  rider,
  id,
  decimals,
}: {
  rider: Rider
  id: AttributeId
  decimals: number
}) {
  const meta = attributeMeta(id)
  const a = rider.attributes[id]
  return (
    <li className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm">{meta.label}</span>
      <span className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {formatNumber(a.value, decimals)} {meta.unit}
        </span>
        <ChangeArrow change={a.change28d} />
        <RatingChip rating={a.rating} lowConfidence={a.confidence === 'low'} />
      </span>
    </li>
  )
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-24">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold" title={hint}>
        {value}
      </dd>
    </div>
  )
}

export function PowerPanel({ rider }: { rider: Rider }) {
  return (
    <Panel title="Power">
      <ul className="divide-y">
        {POWER_ATTRIBUTES.map((id) => (
          <AttributeRow
            key={id}
            rider={rider}
            id={id}
            decimals={id === 'p5s' || id === 'p30s' || id === 'p1m' ? 1 : 2}
          />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        84-day window. Hatched chips are low confidence.
      </p>
    </Panel>
  )
}

export function DurabilityPanel({ rider }: { rider: Rider }) {
  const fresh = rider.durability.find((d) => d.kjPerKg === 0)
  return (
    <Panel title="Durability">
      <ul>
        <AttributeRow rider={rider} id="durability" decimals={0} />
      </ul>
      {fresh && (
        <table className="w-full text-sm">
          <caption className="sr-only">Best power after accumulated work, W/kg</caption>
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="py-1 text-left font-normal">
                After
              </th>
              <th scope="col" className="py-1 text-right font-normal">
                5 min
              </th>
              <th scope="col" className="py-1 text-right font-normal">
                20 min
              </th>
            </tr>
          </thead>
          <tbody>
            {rider.durability.map((d) => (
              <tr key={d.kjPerKg}>
                <th scope="row" className="py-0.5 text-left font-normal">
                  {d.kjPerKg === 0 ? 'Fresh' : `${d.kjPerKg} kJ/kg`}
                </th>
                <td className="py-0.5 text-right">
                  {formatNumber(d.p5mWkg, 2)}
                  {d.kjPerKg > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {formatNumber(retainedPct(fresh.p5mWkg, d.p5mWkg) ?? 0, 0)}%
                    </span>
                  )}
                </td>
                <td className="py-0.5 text-right">
                  {formatNumber(d.p20mWkg, 2)}
                  {d.kjPerKg > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {formatNumber(retainedPct(fresh.p20mWkg, d.p20mWkg) ?? 0, 0)}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}

export function PhysiologyPanel({ rider }: { rider: Rider }) {
  const latest = rider.labTests.at(-1)
  const shown: [string, number | null | undefined, string, number][] = [
    ['VLamax', latest?.vlamaxMmolLS, 'mmol/L/s', 2],
    ['FatMax', latest?.fatmaxW, 'W', 0],
    ['CarbMax', latest?.carbmaxGH, 'g/h', 0],
    ['Anaerobic Threshold', latest?.atW, 'W', 0],
  ]
  return (
    <Panel title="Physiology">
      <ul>
        <AttributeRow rider={rider} id="vo2max" decimals={1} />
      </ul>
      <ul className="divide-y text-sm">
        {shown.map(([label, value, unit, decimals]) => (
          <li key={label} className="flex justify-between py-1">
            <span>{label}</span>
            <span className="text-muted-foreground">
              {value == null ? '–' : `${formatNumber(value, decimals)} ${unit}`}
            </span>
          </li>
        ))}
      </ul>
      {latest && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          Latest test {formatDate(latest.date)}
          {latest.method === 'inscyd_ppd_field' && <Badge variant="outline">Modelled</Badge>}
          <span>· Only VO2max is rated.</span>
        </p>
      )}
    </Panel>
  )
}

export function TrainingStrip({ rider }: { rider: Rider }) {
  const t = rider.training
  return (
    <Panel title="Training">
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        <Stat label="CTL" value={formatNumber(t.ctl)} hint="Fitness, 42-day load" />
        <Stat label="ATL" value={formatNumber(t.atl)} hint="Fatigue, 7-day load" />
        <Stat label="TSB" value={formatNumber(t.tsb, 0, true)} hint="Form: CTL − ATL" />
        <Stat label="Ramp Rate" value={formatNumber(t.rampRate, 1, true)} />
        <Stat label="Compliance (12 Weeks)" value={`${formatNumber(t.compliance12wPct)}%`} />
        <Stat label="Indoor Rides" value={`${formatNumber(t.indoorPct)}%`} />
        <Stat label="Rides (84 Days)" value={formatNumber(t.rides84d)} />
      </dl>
    </Panel>
  )
}

export function ReadinessStrip({ rider }: { rider: Rider }) {
  const r = rider.readiness
  return (
    <Panel title="Readiness">
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        <Stat label="Today" value={<ReadinessLight light={r.light} className="text-base" />} />
        <Stat
          label="ln rMSSD vs Baseline"
          value={r.lnRmssdZ === null ? '–' : `${formatNumber(r.lnRmssdZ, 1, true)} SD`}
          hint="7-day ln rMSSD against the rider's 60-day baseline"
        />
        <Stat
          label="Resting HR vs Baseline"
          value={
            r.restingHrDeltaBpm === null ? '–' : `${formatNumber(r.restingHrDeltaBpm, 0, true)} bpm`
          }
        />
        <Stat
          label="Sleep"
          value={r.sleepHours === null ? '–' : `${formatNumber(r.sleepHours, 1)} h`}
        />
      </dl>
      {r.reasons.length > 0 && (
        <p className="text-sm text-muted-foreground">{r.reasons.join(', ')}</p>
      )}
    </Panel>
  )
}

/** Five terrains shaded by rider-type probability (KB §12). */
export function TerrainMap({ rider }: { rider: Rider }) {
  // Terrain order runs from flat to climbing, with the time trial last.
  const order = ['sprinter', 'all_rounder', 'puncheur', 'climber', 'rouleur_tt'] as const
  return (
    <Panel title="Terrain">
      <ol className="grid grid-cols-5 gap-1.5" aria-label="Terrain fit by rider-type probability">
        {order.map((type) => {
          const p = rider.caPa.typeProbs[type]
          return (
            <li
              key={type}
              className="flex flex-col items-center justify-end gap-1 rounded-sm border p-2 text-center"
              style={{ backgroundColor: `rgb(226 187 122 / ${Math.max(0.05, p * 0.85)})` }}
            >
              <span className={`text-sm font-semibold ${p > 0.5 ? 'text-espresso' : ''}`}>
                {formatPercent(p)}
              </span>
              <span
                className={`text-xs leading-tight ${p > 0.5 ? 'text-espresso' : 'text-muted-foreground'}`}
              >
                {RIDER_TYPE_TERRAIN[type]}
              </span>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}
