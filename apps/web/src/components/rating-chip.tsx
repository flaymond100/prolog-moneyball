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

interface RatingChipProps {
  rating: number
  /** Number of decimals to show; attribute ratings are integers, CA shows one decimal. */
  decimals?: number
  className?: string
}

export function RatingChip({ rating, decimals = 0, className }: RatingChipProps) {
  return (
    <span
      data-slot="rating-chip"
      className={cn(ratingChipVariants({ band: ratingBand(rating) }), className)}
    >
      {rating.toFixed(decimals)}
    </span>
  )
}
