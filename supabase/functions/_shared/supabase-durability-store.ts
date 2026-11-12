// DurabilityStore on Supabase, used by compute-durability with the service
// role key (which may call durability_candidates). Run logging and the daily
// call count come from the sync store.

import { z } from 'zod'
import type { DurabilityCandidate, DurabilityEffortRow, DurabilityStore } from './durability.ts'
import { SupabaseSyncStore } from './supabase-store.ts'

// An rpc result is untyped, so its rows are checked here.
const candidatesSchema = z.array(
  z.object({
    activity_id: z.string(),
    athlete_id: z.string(),
    start_date_local: z.string(),
    weight_kg: z.number().nullable(),
    curve_secs: z.array(z.number()),
    curve_watts: z.array(z.number()),
  }),
)

export class SupabaseDurabilityStore extends SupabaseSyncStore implements DurabilityStore {
  async durabilityCandidates(after: string, limit: number): Promise<DurabilityCandidate[]> {
    const result = await this.db.rpc('durability_candidates', { p_after: after, p_limit: limit })
    if (result.error) throw new Error(`read durability candidates: ${result.error.message}`)
    return candidatesSchema.parse(result.data)
  }

  async upsertDurabilityEfforts(rows: DurabilityEffortRow[]): Promise<void> {
    const written = await this.db
      .from('durability_efforts')
      .upsert(rows, { onConflict: 'activity_id,kj_kg_bucket,duration_s' })
    if (written.error) throw new Error(`upsert durability efforts: ${written.error.message}`)
  }
}
