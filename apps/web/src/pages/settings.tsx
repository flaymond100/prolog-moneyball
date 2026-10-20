import { useSquad } from '@/data/queries.ts'
import { ROLE_LABELS, useRole } from '@/data/role-store.ts'
import {
  BenchmarkSection,
  CaWeightsSection,
  ConsentsSection,
  PaPriorsSection,
  RiderProfilesSection,
  SyncHealthSection,
  TypicalErrorSection,
} from '@/pages/settings/sections.tsx'

export function SettingsPage() {
  const { data: riders = [] } = useSquad()
  const role = useRole()

  return (
    <section aria-labelledby="page-title" className="space-y-4">
      <div>
        <h1 id="page-title" className="text-2xl font-semibold">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Viewing as {ROLE_LABELS[role]}. PA priors are shown to the coach only and consents to
          medical staff only (KB §12).
        </p>
      </div>

      <RiderProfilesSection riders={riders} role={role} />
      <div className="grid gap-4 lg:grid-cols-2">
        <BenchmarkSection role={role} />
        <SyncHealthSection />
      </div>
      <CaWeightsSection role={role} />
      {role === 'coach' && <PaPriorsSection />}
      <TypicalErrorSection role={role} />
      {role === 'medical' && <ConsentsSection riders={riders} />}
    </section>
  )
}
