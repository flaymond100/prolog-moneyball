import { caOnFmScale } from '@prolog/metrics'
import { CaStars } from '@/components/ca-stars.tsx'
import { PaBand } from '@/components/pa-band.tsx'
import { RatingChip } from '@/components/rating-chip.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { RIDER_TYPE_LABELS } from '@/data/labels.ts'
import type { Rider } from '@/data/types.ts'
import { formatNumber, formatPercent } from '@/lib/format.ts'
import { primaryType, riderAge, riderTrainingAge } from '@/lib/rider.ts'

const COHORT_LABELS = { squad: 'Squad', prospect: 'Prospect', alumni: 'Alumni' } as const

export function ProfileHeader({ rider }: { rider: Rider }) {
  const type = primaryType(rider)
  const { caPa } = rider
  const age = riderAge(rider)
  const trainingAge = riderTrainingAge(rider)
  return (
    <header className="flex flex-wrap items-start justify-between gap-6 rounded-md border bg-card p-5">
      <div className="space-y-2">
        <h1 id="page-title" className="text-2xl font-semibold">
          {rider.name}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {type ? (
            <Badge>
              {RIDER_TYPE_LABELS[type]}
              {rider.primaryTypeOverride
                ? ' (Set by Coach)'
                : caPa && ` ${formatPercent(caPa.typeProbs[type])}`}
            </Badge>
          ) : (
            <Badge variant="outline">Type Not Calculated Yet</Badge>
          )}
          <span>{age === null ? 'Age not entered' : `${age} years`}</span>
          <span aria-hidden="true">·</span>
          <span>
            {trainingAge === null
              ? 'Training age not entered'
              : `Training age ${formatNumber(trainingAge, 1)} years`}
          </span>
          <span aria-hidden="true">·</span>
          <span>{COHORT_LABELS[rider.cohort]}</span>
        </div>
        {rider.background && <p className="max-w-prose text-sm">{rider.background}</p>}
      </div>

      {caPa ? (
        <div className="flex flex-wrap gap-8">
          <div className="space-y-1.5">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Current Ability</p>
            <div className="flex items-center gap-2">
              <RatingChip rating={caPa.ca} decimals={1} className="h-8 min-w-12 text-lg" />
              <span className="text-sm text-muted-foreground">{caOnFmScale(caPa.ca)} / 200</span>
            </div>
            <CaStars ca={caPa.ca} />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              Potential Ability
            </p>
            <PaBand caPa={caPa} />
            {caPa.ca12mP50 !== null && (
              <p className="text-xs text-muted-foreground">
                CA in 12 months: {formatNumber(caPa.ca12mP50, 1)} (median)
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="max-w-56 text-sm text-muted-foreground">
          Current and Potential Ability appear once ratings are calculated from the synced data.
        </p>
      )}
    </header>
  )
}
