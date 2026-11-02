import type { SyncOutcome, SyncRun } from '@/data/types.ts'
import { formatDateTime } from '@/lib/format.ts'

export const SYNC_OUTCOME_LABELS: Record<SyncOutcome, string> = {
  running: 'Running',
  succeeded: 'Succeeded',
  partial: 'Partly succeeded',
  failed: 'Failed',
  stalled: 'Stalled',
}

/** Banner text when the last nightly sync failed or never finished (TODO 3.7); otherwise null. */
export function syncBannerMessage(lastRun: SyncRun | null): string | null {
  if (lastRun?.outcome === 'failed') {
    return `The nightly sync on ${formatDateTime(lastRun.startedAt)} failed, so data may be out of date.`
  }
  if (lastRun?.outcome === 'stalled') {
    return `The nightly sync started on ${formatDateTime(lastRun.startedAt)} did not finish, so data may be out of date.`
  }
  return null
}
