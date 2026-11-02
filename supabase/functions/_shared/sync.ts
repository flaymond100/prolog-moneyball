// Nightly sync from intervals.icu into Postgres (TODO 3.4, KB §3–5, §11).
//
// Per coached athlete: activities from today − 4 days (detail with intervals
// only for new or re-analysed ones, Strava skipped), wellness for the same
// days (cycle fields stripped, kept only with consent), power curves for
// 42 d, 84 d and season, and planned workouts and races for the next 56 days.
// Every write is an upsert on the table's key, so re-running is idempotent.
//
// Storage sits behind SyncStore so this file has no IO of its own and the
// backfill (TODO 3.5) can reuse the activity and wellness steps.

import {
  type IcuClient,
  icuActivitiesSchema,
  icuAthleteSummarySchema,
  icuEventsSchema,
  icuPowerCurvesSchema,
  icuWellnessSchema,
} from './icu.ts'

export const LOOKBACK_DAYS = 4
export const PLAN_DAYS = 56
const DETAIL_BATCH = 10
const RIDE_CURVE_TYPE = 'Ride' // the Ride sport includes virtual, gravel and track rides
const PLANNED_CATEGORIES = 'WORKOUT,RACE_A,RACE_B,RACE_C' // KB §4
const CYCLE_FIELDS = new Set(['menstrualPhase', 'menstrualPhasePredicted'])

// Rows ----------------------------------------------------------------------

type Json = Record<string, unknown>

export interface AthleteRow {
  id: string
  name: string
  active: boolean
  raw: Json
  synced_at: string
}
export interface ActivityRow {
  id: string
  athlete_id: string
  start_date_local: string
  raw: Json
}
export interface IntervalRow {
  interval_id: number
  raw: Json
}
export interface WellnessRow {
  athlete_id: string
  date: string
  raw: Json
  synced_at: string
}
export type CycleDataRow = WellnessRow
export interface PowerCurveRow {
  athlete_id: string
  as_of: string
  time_window: '42d' | '84d' | 'season'
  secs: number[]
  watts: number[]
  wkg: number[] | null
  raw: Json
  synced_at: string
}
export interface PlannedEventRow {
  id: string
  athlete_id: string
  start_date_local: string
  raw: Json
  synced_at: string
}

export interface SyncError {
  athlete_id: string | null
  step: string
  message: string
}

export interface RunResult {
  status: 'succeeded' | 'partial' | 'failed'
  athlete_ids: string[]
  counts: Record<string, number>
  errors: SyncError[]
  api_calls: number
  rate_limit_remaining: number | null
}

export interface SyncStore {
  startRun(job: string, params: Json): Promise<number>
  /** API calls logged by runs that started since UTC midnight. */
  callsToday(): Promise<number>
  finishRun(runId: number, result: RunResult): Promise<void>
  seasonStart(): Promise<string>
  cycleConsentAthletes(): Promise<Set<string>>
  /** app_settings.wellness_scope; anything unexpected reads as `training_load`. */
  wellnessScope(): Promise<WellnessScope>
  upsertAthletes(rows: AthleteRow[]): Promise<void>
  /** Marks athletes missing from the summary inactive; returns how many changed. */
  deactivateAthletesExcept(ids: string[]): Promise<number>
  /** Stored activityVersion() per id, for the ids that exist. */
  activityVersions(ids: string[]): Promise<Map<string, string | null>>
  /** Upserts the activity and replaces its intervals in one transaction. */
  upsertActivity(row: ActivityRow, intervals: IntervalRow[]): Promise<void>
  upsertWellness(rows: WellnessRow[]): Promise<void>
  upsertCycleData(rows: CycleDataRow[]): Promise<void>
  upsertPowerCurves(rows: PowerCurveRow[]): Promise<void>
  /** Upserts events, then deletes the athlete's other events in [from, toExclusive); returns deletions. */
  replacePlannedEvents(
    athleteId: string,
    from: string,
    toExclusive: string,
    rows: PlannedEventRow[],
  ): Promise<number>
}

// Helpers -------------------------------------------------------------------

/** YYYY-MM-DD plus whole days, in UTC. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Changes whenever intervals.icu re-analyses or re-syncs an activity. */
export function activityVersion(raw: Readonly<Record<string, unknown>>): string | null {
  for (const value of [raw.analyzed, raw.icu_sync_date]) {
    if (typeof value === 'string' && value !== '') return value
  }
  return null
}

/**
 * athlete-summary returns one row per athlete and period (each row has a
 * `date`); keeps the latest row per athlete, in first-seen order.
 */
export function latestSummaryPerAthlete<T extends { athlete_id: string; date?: unknown }>(
  rows: T[],
): T[] {
  const date = (row: T) => (typeof row.date === 'string' ? row.date : '')
  const latest = new Map<string, T>()
  for (const row of rows) {
    const seen = latest.get(row.athlete_id)
    if (!seen || date(row) > date(seen)) latest.set(row.athlete_id, row)
  }
  return [...latest.values()]
}

/**
 * Which wellness fields the sync keeps (app_settings.wellness_scope).
 * `training_load` until the privacy documents are signed off (KB §11).
 */
export type WellnessScope = 'training_load' | 'all'

// Allow-list, so a field intervals.icu adds later is never stored by accident.
// `id` is the date; `updated` lets a later re-sync see changes.
const TRAINING_LOAD_FIELDS = new Set([
  'id',
  'updated',
  'ctl',
  'atl',
  'rampRate',
  'ctlLoad',
  'atlLoad',
  'sportInfo', // eFTP per sport
  'weight',
])

/** Keeps only the training-load fields of a wellness record (no HRV, sleep or subjective data). */
export function trainingLoadOnly(record: Json): Json {
  return Object.fromEntries(Object.entries(record).filter(([key]) => TRAINING_LOAD_FIELDS.has(key)))
}

/** Removes cycle fields from a wellness record; returns them only if any is set. */
export function splitCycleFields(record: Json): { wellness: Json; cycle: Json | null } {
  const entries = Object.entries(record)
  const wellness = Object.fromEntries(entries.filter(([key]) => !CYCLE_FIELDS.has(key)))
  const cycle = Object.fromEntries(
    entries.filter(
      ([key, value]) => CYCLE_FIELDS.has(key) && value !== null && value !== undefined,
    ),
  )
  return { wellness, cycle: Object.keys(cycle).length > 0 ? cycle : null }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Steps ---------------------------------------------------------------------

export interface SyncContext {
  client: IcuClient
  store: SyncStore
  counts: Record<string, number>
  now: () => string // ISO timestamp for synced_at
}

function count(ctx: SyncContext, key: string, n: number) {
  ctx.counts[key] = (ctx.counts[key] ?? 0) + n
}

export async function syncActivities(
  ctx: SyncContext,
  athleteId: string,
  oldest: string,
  newest: string,
) {
  const a = encodeURIComponent(athleteId)
  // `newest` takes a date or a date and time; the time keeps the whole last day in.
  const list = await ctx.client.get(`/athlete/${a}/activities`, icuActivitiesSchema, {
    oldest,
    newest: `${newest}T23:59:59`,
  })

  // Strava-sourced activities come back nearly empty (KB §4): skip and count.
  const usable = list.filter((act) => act.source !== 'STRAVA')
  count(ctx, 'activities_skipped_strava', list.length - usable.length)

  const stored = await ctx.store.activityVersions(usable.map((act) => act.id))
  const changed = usable.filter((act) => {
    const version = activityVersion(act)
    return !stored.has(act.id) || version === null || stored.get(act.id) !== version
  })
  count(ctx, 'activities_unchanged', usable.length - changed.length)

  for (let i = 0; i < changed.length; i += DETAIL_BATCH) {
    const ids = changed.slice(i, i + DETAIL_BATCH).map((act) => encodeURIComponent(act.id))
    const details = await ctx.client.get(
      `/athlete/${a}/activities/${ids.join(',')}`,
      icuActivitiesSchema,
      {
        intervals: true,
      },
    )
    for (const detail of details) {
      // Intervals go to activity_intervals; groups are summaries of them and are dropped.
      const raw: Json = { ...detail }
      delete raw.icu_intervals
      delete raw.icu_groups
      const intervals = (detail.icu_intervals ?? []).map((interval) => ({
        interval_id: interval.id,
        raw: interval,
      }))
      await ctx.store.upsertActivity(
        { id: detail.id, athlete_id: athleteId, start_date_local: detail.start_date_local, raw },
        intervals,
      )
      count(ctx, 'activities', 1)
      count(ctx, 'activity_intervals', intervals.length)
    }
  }
}

export async function syncWellness(
  ctx: SyncContext,
  athleteId: string,
  oldest: string,
  newest: string,
  cycleConsent: boolean,
  scope: WellnessScope,
) {
  const records = await ctx.client.get(
    `/athlete/${encodeURIComponent(athleteId)}/wellness.json`,
    icuWellnessSchema,
    { oldest, newest },
  )
  const syncedAt = ctx.now()
  const wellness: WellnessRow[] = []
  const cycle: CycleDataRow[] = []
  for (const record of records) {
    const split = splitCycleFields(record)
    wellness.push({
      athlete_id: athleteId,
      date: record.id,
      raw: scope === 'training_load' ? trainingLoadOnly(split.wellness) : split.wellness,
      synced_at: syncedAt,
    })
    // KB §11: cycle fields only with an active consent, and never in wellness.raw.
    if (cycleConsent && split.cycle) {
      cycle.push({ athlete_id: athleteId, date: record.id, raw: split.cycle, synced_at: syncedAt })
    }
  }
  await ctx.store.upsertWellness(wellness)
  if (cycle.length > 0) await ctx.store.upsertCycleData(cycle)
  count(ctx, 'wellness', wellness.length)
  count(ctx, 'cycle_data', cycle.length)
}

export async function syncPowerCurves(
  ctx: SyncContext,
  athleteId: string,
  today: string,
  seasonStart: string,
) {
  const season = seasonStart <= today ? `r.${seasonStart}.${today}` : null
  const windows = new Map<string, PowerCurveRow['time_window']>([
    ['42d', '42d'],
    ['84d', '84d'],
  ])
  if (season) windows.set(season, 'season')

  const res = await ctx.client.get(
    `/athlete/${encodeURIComponent(athleteId)}/power-curves.json`,
    icuPowerCurvesSchema,
    { type: RIDE_CURVE_TYPE, curves: [...windows.keys()].join(',') },
  )
  const syncedAt = ctx.now()
  const rows: PowerCurveRow[] = []
  for (const curve of res.list) {
    const window = windows.get(curve.id)
    // No rides in the window: nothing to store (the table rejects empty curves).
    if (!window || curve.secs.length === 0 || curve.values.length !== curve.secs.length) continue
    const wkg = curve.watts_per_kg?.length === curve.secs.length ? curve.watts_per_kg : null
    rows.push({
      athlete_id: athleteId,
      as_of: today,
      time_window: window,
      secs: curve.secs,
      watts: curve.values,
      wkg,
      raw: curve,
      synced_at: syncedAt,
    })
  }
  if (rows.length > 0) await ctx.store.upsertPowerCurves(rows)
  count(ctx, 'power_curves', rows.length)
}

export async function syncPlannedEvents(ctx: SyncContext, athleteId: string, today: string) {
  const newest = addDays(today, PLAN_DAYS)
  const events = await ctx.client.get(
    `/athlete/${encodeURIComponent(athleteId)}/events.json`,
    icuEventsSchema,
    { oldest: today, newest, category: PLANNED_CATEGORIES },
  )
  const syncedAt = ctx.now()
  const rows = events.map((event) => ({
    id: String(event.id),
    athlete_id: athleteId,
    start_date_local: event.start_date_local,
    raw: event,
    synced_at: syncedAt,
  }))
  // Events deleted in intervals.icu disappear from the synced window too.
  const deleted = await ctx.store.replacePlannedEvents(athleteId, today, addDays(newest, 1), rows)
  count(ctx, 'planned_events', rows.length)
  count(ctx, 'planned_events_deleted', deleted)
}

// Run -----------------------------------------------------------------------

/**
 * Reads the coached athletes and upserts them; returns their ids in summary
 * order. With `deactivateMissing`, athletes no longer coached are marked inactive.
 */
export async function syncAthletes(
  ctx: SyncContext,
  deactivateMissing: boolean,
): Promise<string[]> {
  const summary = await ctx.client.get('/athlete/0/athlete-summary.json', icuAthleteSummarySchema)
  const athletes = latestSummaryPerAthlete(summary)
  const syncedAt = ctx.now()
  await ctx.store.upsertAthletes(
    athletes.map((s) => ({
      id: s.athlete_id,
      name: s.athlete_name ?? s.athlete_id,
      active: true,
      raw: s,
      synced_at: syncedAt,
    })),
  )
  count(ctx, 'athletes', athletes.length)
  const ids = athletes.map((s) => s.athlete_id)
  // An empty summary is more likely an API problem than a squad of none.
  if (deactivateMissing && ids.length > 0) {
    count(ctx, 'athletes_deactivated', await ctx.store.deactivateAthletesExcept(ids))
  }
  return ids
}

/** Runs one step for one athlete, recording a failure instead of throwing. */
export async function runStep(
  errors: SyncError[],
  athleteId: string,
  step: string,
  run: () => Promise<void>,
): Promise<boolean> {
  try {
    await run()
    return true
  } catch (error) {
    errors.push({ athlete_id: athleteId, step, message: message(error) })
    return false
  }
}

/** succeeded without errors; partial when some athlete got through; failed otherwise. */
export function runResult(ctx: SyncContext, athleteIds: string[], errors: SyncError[]): RunResult {
  const failed = new Set(errors.map((e) => e.athlete_id))
  const anyAthleteOk = athleteIds.some((id) => !failed.has(id))
  return {
    status:
      errors.length === 0 ? 'succeeded' : !failed.has(null) && anyAthleteOk ? 'partial' : 'failed',
    athlete_ids: athleteIds,
    counts: ctx.counts,
    errors,
    api_calls: ctx.client.calls,
    // intervals.icu sends no rate-limit headers (docs/intervals-api.md), so this stays null.
    rate_limit_remaining: ctx.client.rateLimitRemaining,
  }
}

export function setupError(error: unknown): SyncError {
  return { athlete_id: null, step: 'setup', message: message(error) }
}

export interface NightlyOptions {
  client: IcuClient
  store: SyncStore
  today: string // YYYY-MM-DD (UTC)
  now?: () => string
}

export async function runNightlySync(
  options: NightlyOptions,
): Promise<RunResult & { run_id: number }> {
  const { client, store, today } = options
  const ctx: SyncContext = {
    client,
    store,
    counts: {},
    now: options.now ?? (() => new Date().toISOString()),
  }
  const errors: SyncError[] = []
  const athleteIds: string[] = []
  const runId = await store.startRun('sync-nightly', { today })

  try {
    const [ids, seasonStart, consents, scope] = await Promise.all([
      syncAthletes(ctx, true),
      store.seasonStart(),
      store.cycleConsentAthletes(),
      store.wellnessScope(),
    ])
    athleteIds.push(...ids)

    const oldest = addDays(today, -LOOKBACK_DAYS)
    for (const athleteId of athleteIds) {
      // One failing step or rider never stops the others.
      await runStep(errors, athleteId, 'activities', () =>
        syncActivities(ctx, athleteId, oldest, today),
      )
      await runStep(errors, athleteId, 'wellness', () =>
        syncWellness(ctx, athleteId, oldest, today, consents.has(athleteId), scope),
      )
      await runStep(errors, athleteId, 'power_curves', () =>
        syncPowerCurves(ctx, athleteId, today, seasonStart),
      )
      await runStep(errors, athleteId, 'planned_events', () =>
        syncPlannedEvents(ctx, athleteId, today),
      )
    }
  } catch (error) {
    errors.push(setupError(error))
  }

  const result = runResult(ctx, athleteIds, errors)
  await store.finishRun(runId, result)
  return { run_id: runId, ...result }
}
