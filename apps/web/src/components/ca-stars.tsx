import { caStars } from '@prolog/metrics'
import { Star, StarHalf } from 'lucide-react'

/** CA as five stars, rounded to half stars (KB §7). */
export function CaStars({ ca }: { ca: number }) {
  const stars = caStars(ca)
  return (
    <span role="img" aria-label={`${stars} of 5 stars`} className="inline-flex text-gold">
      {Array.from({ length: 5 }, (_, i) => {
        if (stars >= i + 1)
          return <Star key={i} className="size-4 fill-current" aria-hidden="true" />
        if (stars >= i + 0.5) {
          return (
            <span key={i} className="relative inline-flex">
              <Star className="size-4 text-muted-foreground/40" aria-hidden="true" />
              <StarHalf className="absolute inset-0 size-4 fill-current" aria-hidden="true" />
            </span>
          )
        }
        return <Star key={i} className="size-4 text-muted-foreground/40" aria-hidden="true" />
      })}
    </span>
  )
}
