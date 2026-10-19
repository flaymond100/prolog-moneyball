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
  return (
    <header className="flex flex-wrap items-start justify-between gap-6 rounded-md border bg-card p-5">
      <div className="space-y-2">
        <h1 id="page-title" className="text-2xl font-semibold">
          {rider.name}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge>
            {RIDER_TYPE_LABELS[type]}
            {rider.primaryTypeOverride
              ? ' (Set by Coach)'
              : ` ${formatPercent(caPa.typeProbs[type])}`}
          </Badge>
          <span>{riderAge(rider)} years</span>
          <span aria-hidden="true">·</span>
          <span>Training age {formatNumber(riderTrainingAge(rider), 1)} years</span>
          <span aria-hidden="true">·</span>
          <span>{COHORT_LABELS[rider.cohort]}</span>
        </div>
        <p className="max-w-prose text-sm">{rider.background}</p>
      </div>

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
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Potential Ability</p>
          <PaBand caPa={caPa} />
          <p className="text-xs text-muted-foreground">
            CA in 12 months: {formatNumber(caPa.ca12mP50, 1)} (median)
          </p>
        </div>
      </div>
    </header>
  )
}
