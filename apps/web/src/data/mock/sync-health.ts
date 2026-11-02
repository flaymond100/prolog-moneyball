import { MOCK_AS_OF, MOCK_RIDERS } from '@/data/mock/riders.ts'
import type { SyncHealth } from '@/data/types.ts'

// Mock stand-in for v_sync_last_run and v_sync_health (TODO 3.7): last
// night's run succeeded for both synthetic riders. Read the views once the
// data layer talks to Supabase (TODO 4.3).

const started = `${MOCK_AS_OF}T02:30:04Z`
const finished = `${MOCK_AS_OF}T02:30:41Z`

export const MOCK_SYNC_HEALTH: SyncHealth = {
  lastRun: {
    id: 1,
    outcome: 'succeeded',
    startedAt: started,
    finishedAt: finished,
    apiCalls: 9,
    errorCount: 0,
    errors: [],
  },
  riders: MOCK_RIDERS.map((rider) => ({
    athleteId: rider.id,
    name: rider.name,
    lastSuccessAt: finished,
    stale: false,
  })),
}
