import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils.ts'

interface ChangeArrowProps {
  /** Rating change over 28 days (KB §6). */
  change: number
  className?: string
}

export function ChangeArrow({ change, className }: ChangeArrowProps) {
  if (change === 0) {
    return (
      <span className={cn('inline-block w-3.5', className)} aria-label="No change in 28 days" />
    )
  }
  const up = change > 0
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <Icon
      role="img"
      aria-label={`${up ? 'Up' : 'Down'} ${Math.abs(change)} in 28 days`}
      className={cn(
        'inline-block size-3.5',
        up ? 'text-rating-band-3' : 'text-rating-band-1',
        className,
      )}
    />
  )
}
