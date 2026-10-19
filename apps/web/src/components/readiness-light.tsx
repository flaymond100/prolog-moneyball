import type { ReadinessLight as Light } from '@/data/types.ts'
import { cn } from '@/lib/utils.ts'

const LIGHTS: Record<Light, { label: string; className: string }> = {
  green: { label: 'Green', className: 'bg-rating-band-3' },
  amber: { label: 'Amber', className: 'bg-rating-band-2' },
  red: { label: 'Red', className: 'bg-rating-band-1' },
  grey: { label: 'Insufficient HRV data', className: 'bg-muted-foreground' },
}

export function ReadinessLight({ light, className }: { light: Light; className?: string }) {
  const { label, className: colour } = LIGHTS[light]
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={cn('size-2.5 rounded-full', colour)} aria-hidden="true" />
      {label}
    </span>
  )
}
