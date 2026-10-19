import { cva } from 'class-variance-authority'
import { ratingBand } from '@/lib/rating.ts'
import { cn } from '@/lib/utils.ts'

const ratingChipVariants = cva(
  'inline-flex h-6 min-w-7 items-center justify-center rounded-sm px-1 text-sm font-semibold tabular-nums text-rating-foreground',
  {
    variants: {
      band: {
        1: 'bg-rating-band-1',
        2: 'bg-rating-band-2',
        3: 'bg-rating-band-3',
        4: 'bg-rating-band-4',
      },
    },
  },
)

// KB §6: low-confidence attributes render hatched.
const HATCH = 'repeating-linear-gradient(135deg, transparent 0 3px, rgb(0 0 0 / 0.3) 3px 5px)'

interface RatingChipProps {
  rating: number
  /** Number of decimals to show; attribute ratings are integers, CA shows one decimal. */
  decimals?: number
  lowConfidence?: boolean
  className?: string
}

export function RatingChip({
  rating,
  decimals = 0,
  lowConfidence = false,
  className,
}: RatingChipProps) {
  return (
    <span
      data-slot="rating-chip"
      data-confidence={lowConfidence ? 'low' : undefined}
      title={lowConfidence ? 'Low confidence: fewer than 3 days near the best' : undefined}
      style={lowConfidence ? { backgroundImage: HATCH } : undefined}
      className={cn(ratingChipVariants({ band: ratingBand(rating) }), className)}
    >
      {rating.toFixed(decimals)}
      {lowConfidence && <span className="sr-only"> (low confidence)</span>}
    </span>
  )
}
