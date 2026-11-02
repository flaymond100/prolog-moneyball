import { Link } from '@tanstack/react-router'
import { TriangleAlert } from 'lucide-react'
import { useSyncHealth } from '@/data/queries.ts'
import { syncBannerMessage } from '@/lib/sync-health.ts'

/** Shown on every page when the last nightly sync failed or stalled (TODO 3.7). */
export function SyncBanner() {
  const { data } = useSyncHealth()
  const message = syncBannerMessage(data?.lastRun ?? null)
  if (!message) return null
  return (
    <div
      role="alert"
      className="flex items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-6 py-2 text-sm text-destructive"
    >
      <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
      <span>
        {message}{' '}
        <Link to="/settings" className="underline underline-offset-2">
          See Sync Health
        </Link>
      </span>
    </div>
  )
}
