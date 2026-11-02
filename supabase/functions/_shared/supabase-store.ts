// SyncStore on Supabase, used by the Edge Functions with the service role key
// (which bypasses RLS and the client column grants of TODO 2.10).

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  activityVersion,
  type ActivityRow,
  type AthleteRow,
  type CycleDataRow,
  type IntervalRow,
  type PlannedEventRow,
  type PowerCurveRow,
  type RunResult,
  type SyncStore,
  type WellnessRow,
  type WellnessScope,
} from './sync.ts'

interface Result<T> {
  data: T | null
  error: { message: string } | null
}

/** Throws on a database error; for writes that return nothing. */
function ok(result: Result<unknown>, what: string): void {
  if (result.error) throw new Error(`${what}: ${result.error.message}`)
}

/** Throws on a database error or missing data; for reads and writes with `.select()`. */
function rows<T>(result: Result<T>, what: string): T {
  ok(result, what)
  if (result.data === null) throw new Error(`${what}: no data returned`)
  return result.data
}

// PostgREST `in` list; ids are quoted in case one ever contains a comma.
function inList(ids: string[]): string {
  return `(${ids.map((id) => `"${id.replaceAll('"', '""')}"`).join(',')})`
}

export class SupabaseSyncStore implements SyncStore {
  private readonly db: SupabaseClient

  constructor(db: SupabaseClient) {
    this.db = db
  }

  async startRun(job: string, params: Record<string, unknown>): Promise<number> {
    const run = rows(
      await this.db.from('sync_runs').insert({ job, params }).select('id').single<{ id: number }>(),
      'start sync run',
    )
    return run.id
  }

  async callsToday(): Promise<number> {
    const midnight = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`
    const runs = rows(
      await this.db
        .from('sync_runs')
        .select('api_calls')
        .gte('started_at', midnight)
        .overrideTypes<{ api_calls: number | null }[], { merge: false }>(),
      'read calls today',
    )
    return runs.reduce((sum, run) => sum + (run.api_calls ?? 0), 0)
  }

  async finishRun(runId: number, result: RunResult): Promise<void> {
    ok(
      await this.db
        .from('sync_runs')
        .update({ ...result, finished_at: new Date().toISOString() })
        .eq('id', runId),
      'finish sync run',
    )
  }

  async seasonStart(): Promise<string> {
    const setting = rows(
      await this.db
        .from('app_settings')
        .select('value')
        .eq('key', 'season_start')
        .single<{ value: unknown }>(),
      'read season start',
    )
    if (typeof setting.value !== 'string') throw new Error('season_start setting is not a date')
    return setting.value
  }

  async cycleConsentAthletes(): Promise<Set<string>> {
    const consents = rows(
      await this.db
        .from('consents')
        .select('athlete_id')
        .eq('scope', 'cycle_data')
        .is('withdrawn_at', null)
        .lte('granted_at', new Date().toISOString())
        .overrideTypes<{ athlete_id: string }[], { merge: false }>(),
      'read cycle consents',
    )
    return new Set(consents.map((row) => row.athlete_id))
  }

  async wellnessScope(): Promise<WellnessScope> {
    const settings = rows(
      await this.db
        .from('app_settings')
        .select('value')
        .eq('key', 'wellness_scope')
        .overrideTypes<{ value: unknown }[], { merge: false }>(),
      'read wellness scope',
    )
    // Missing or unexpected: keep the narrow scope rather than collect health data.
    return settings[0]?.value === 'all' ? 'all' : 'training_load'
  }

  async upsertAthletes(athletes: AthleteRow[]): Promise<void> {
    if (athletes.length === 0) return
    ok(await this.db.from('athletes').upsert(athletes, { onConflict: 'id' }), 'upsert athletes')
  }

  async deactivateAthletesExcept(ids: string[]): Promise<number> {
    const changed = rows(
      await this.db
        .from('athletes')
        .update({ active: false })
        .eq('active', true)
        .not('id', 'in', inList(ids))
        .select('id'),
      'deactivate athletes',
    )
    return changed.length
  }

  async activityVersions(ids: string[]): Promise<Map<string, string | null>> {
    if (ids.length === 0) return new Map()
    const stored = rows(
      await this.db
        .from('activities')
        .select('id, analyzed:raw->>analyzed, icu_sync_date:raw->>icu_sync_date')
        .in('id', ids)
        .overrideTypes<
          { id: string; analyzed: string | null; icu_sync_date: string | null }[],
          { merge: false }
        >(),
      'read activity versions',
    )
    return new Map(stored.map((row) => [row.id, activityVersion(row)]))
  }

  async upsertActivity(activity: ActivityRow, intervals: IntervalRow[]): Promise<void> {
    ok(
      await this.db.rpc('sync_upsert_activity', { p_activity: activity, p_intervals: intervals }),
      `upsert activity ${activity.id}`,
    )
  }

  async upsertWellness(records: WellnessRow[]): Promise<void> {
    if (records.length === 0) return
    ok(
      await this.db.from('wellness').upsert(records, { onConflict: 'athlete_id,date' }),
      'upsert wellness',
    )
  }

  async upsertCycleData(records: CycleDataRow[]): Promise<void> {
    ok(
      await this.db.from('cycle_data').upsert(records, { onConflict: 'athlete_id,date' }),
      'upsert cycle data',
    )
  }

  async upsertPowerCurves(curves: PowerCurveRow[]): Promise<void> {
    ok(
      await this.db
        .from('power_curves')
        .upsert(curves, { onConflict: 'athlete_id,as_of,time_window' }),
      'upsert power curves',
    )
  }

  async replacePlannedEvents(
    athleteId: string,
    from: string,
    toExclusive: string,
    events: PlannedEventRow[],
  ): Promise<number> {
    if (events.length > 0) {
      ok(
        await this.db.from('planned_events').upsert(events, { onConflict: 'id' }),
        'upsert planned events',
      )
    }
    let stale = this.db
      .from('planned_events')
      .delete()
      .eq('athlete_id', athleteId)
      .gte('start_date_local', from)
      .lt('start_date_local', toExclusive)
    if (events.length > 0) stale = stale.not('id', 'in', inList(events.map((e) => e.id)))
    return rows(await stale.select('id'), 'delete stale planned events').length
  }
}
