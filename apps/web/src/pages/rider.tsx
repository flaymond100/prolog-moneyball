import { getRouteApi, Link } from '@tanstack/react-router'
import { useRider } from '@/data/queries.ts'
import { DurabilityFunnel, PowerCurveChart } from '@/pages/rider/charts.tsx'
import { ProfileHeader } from '@/pages/rider/header.tsx'
import { LabTimeline, NotesPanel } from '@/pages/rider/history.tsx'
import {
  DurabilityPanel,
  PhysiologyPanel,
  PowerPanel,
  ReadinessStrip,
  TerrainMap,
  TrainingStrip,
} from '@/pages/rider/panels.tsx'

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
    <article aria-labelledby="page-title" className="space-y-4">
      <ProfileHeader rider={rider} />

      <div className="grid gap-4 lg:grid-cols-3">
        <PowerPanel rider={rider} />
        <DurabilityPanel rider={rider} />
        <PhysiologyPanel rider={rider} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TrainingStrip rider={rider} />
        <ReadinessStrip rider={rider} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PowerCurveChart rider={rider} />
        </div>
        <div className="space-y-4">
          <TerrainMap rider={rider} />
          <DurabilityFunnel rider={rider} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LabTimeline rider={rider} />
        <NotesPanel rider={rider} />
      </div>
    </article>
  )
}
