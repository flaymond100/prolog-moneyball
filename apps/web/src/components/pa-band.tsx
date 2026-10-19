import type { CaPa } from '@/data/types.ts'
import { formatNumber } from '@/lib/format.ts'
import { RATING_MAX, RATING_MIN } from '@/lib/rating.ts'

function position(rating: number): string {
  return `${((rating - RATING_MIN) / (RATING_MAX - RATING_MIN)) * 100}%`
}

/** "PA 16.3 (14.8–17.6)" with a band bar on the 1–20 scale; never a single number (KB §8). */
export function PaBand({ caPa }: { caPa: CaPa }) {
  const { ca, paP10, paP50, paP90 } = caPa
  const text = `PA ${formatNumber(paP50, 1)} (${formatNumber(paP10, 1)}–${formatNumber(paP90, 1)})`
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{text}</p>
      <div
        role="img"
        aria-label={`${text}; current ability ${formatNumber(ca, 1)}`}
        className="relative h-2.5 w-48 rounded-full bg-muted"
      >
        <span
          className="absolute inset-y-0 rounded-full bg-gold/40"
          style={{ left: position(paP10), width: `calc(${position(paP90)} - ${position(paP10)})` }}
        />
        <span
          className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 bg-gold"
          style={{ left: position(paP50) }}
        />
        <span
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-cream"
          style={{ left: position(ca) }}
          title={`CA ${formatNumber(ca, 1)}`}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Band P10–P90; line = median; dot = current ability
      </p>
    </div>
  )
}
