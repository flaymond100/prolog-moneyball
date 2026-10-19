import { getRouteApi, Link } from '@tanstack/react-router'
import { useRider } from '@/data/queries.ts'

const route = getRouteApi('/app/riders/$riderId')

export function RiderPage() {
  const { riderId } = route.useParams()
  const { data: rider, isPending } = useRider(riderId)

  if (isPending) return null
  if (!rider) {
    return (
      <section aria-labelledby="page-title" className="space-y-2">
        <h1 id="page-title" className="text-2xl font-semibold">
          Rider Not Found
        </h1>
        <Link to="/squad" className="text-primary underline-offset-4 hover:underline">
          Back to Squad
        </Link>
      </section>
    )
  }

  return (
    <section aria-labelledby="page-title" className="space-y-2">
      <h1 id="page-title" className="text-2xl font-semibold">
        {rider.name}
      </h1>
      <p className="text-sm text-muted-foreground">The full profile arrives with task 6.2.</p>
    </section>
  )
}
