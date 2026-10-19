import { Link } from '@tanstack/react-router'
import { RatingChip } from '@/components/rating-chip.tsx'
import { RIDER_TYPE_LABELS } from '@/data/labels.ts'
import { useSquad } from '@/data/queries.ts'
import { primaryType, riderAge } from '@/lib/rider.ts'

export function SquadPage() {
  const { data: riders = [] } = useSquad()

  return (
    <section aria-labelledby="page-title" className="space-y-4">
      <h1 id="page-title" className="text-2xl font-semibold">
        Squad
      </h1>
      <ul className="max-w-xl divide-y rounded-md border" aria-label="Riders">
        {riders.map((rider) => (
          <li key={rider.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <Link
                to="/riders/$riderId"
                params={{ riderId: rider.id }}
                className="font-medium hover:text-primary"
              >
                {rider.name}
              </Link>
              <p className="text-sm text-muted-foreground">
                {RIDER_TYPE_LABELS[primaryType(rider)]} · {riderAge(rider)} years
              </p>
            </div>
            <RatingChip rating={rider.caPa.ca} decimals={1} />
          </li>
        ))}
      </ul>
    </section>
  )
}
