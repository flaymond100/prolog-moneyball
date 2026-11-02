// Test doubles for the sync: an in-memory SyncStore and a scripted intervals.icu.
// Imported by *.test.ts only.

import { IcuClient } from './icu.ts'
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

// In-memory store keyed like the tables ---------------------------------------

export class FakeStore implements SyncStore {
  runs = new Map<number, { job: string; params: unknown; result?: RunResult }>()
  athletes = new Map<string, AthleteRow>()
  activities = new Map<string, ActivityRow>()
  intervals = new Map<string, IntervalRow[]>()
  wellness = new Map<string, WellnessRow>()
  cycle = new Map<string, CycleDataRow>()
  curves = new Map<string, PowerCurveRow>()
  events = new Map<string, PlannedEventRow>()
  season = '2026-10-01'
  consents = new Set<string>()
  activityWrites = 0

  startRun(job: string, params: unknown) {
    const id = this.runs.size + 1
    this.runs.set(id, { job, params })
    return Promise.resolve(id)
  }
  callsTodayValue = 0
  callsToday() {
    return Promise.resolve(this.callsTodayValue)
  }
  finishRun(runId: number, result: RunResult) {
    const run = this.runs.get(runId)
    if (run) run.result = result
    return Promise.resolve()
  }
  seasonStart() {
    return Promise.resolve(this.season)
  }
  cycleConsentAthletes() {
    return Promise.resolve(this.consents)
  }
  // 'all' so most tests see whole records; the scope tests switch it.
  scope: WellnessScope = 'all'
  wellnessScope() {
    return Promise.resolve(this.scope)
  }
  upsertAthletes(rows: AthleteRow[]) {
    for (const row of rows) this.athletes.set(row.id, row)
    return Promise.resolve()
  }
  deactivateAthletesExcept(ids: string[]) {
    let n = 0
    for (const row of this.athletes.values()) {
      if (row.active && !ids.includes(row.id)) {
        row.active = false
        n++
      }
    }
    return Promise.resolve(n)
  }
  activityVersions(ids: string[]) {
    const found = new Map<string, string | null>()
    for (const id of ids) {
      const row = this.activities.get(id)
      if (row) found.set(id, activityVersion(row.raw))
    }
    return Promise.resolve(found)
  }
  upsertActivity(row: ActivityRow, intervals: IntervalRow[]) {
    this.activityWrites++
    this.activities.set(row.id, row)
    this.intervals.set(row.id, intervals)
    return Promise.resolve()
  }
  upsertWellness(rows: WellnessRow[]) {
    for (const row of rows) this.wellness.set(`${row.athlete_id}/${row.date}`, row)
    return Promise.resolve()
  }
  upsertCycleData(rows: CycleDataRow[]) {
    for (const row of rows) this.cycle.set(`${row.athlete_id}/${row.date}`, row)
    return Promise.resolve()
  }
  upsertPowerCurves(rows: PowerCurveRow[]) {
    for (const row of rows)
      this.curves.set(`${row.athlete_id}/${row.as_of}/${row.time_window}`, row)
    return Promise.resolve()
  }
  replacePlannedEvents(
    athleteId: string,
    from: string,
    toExclusive: string,
    rows: PlannedEventRow[],
  ) {
    for (const row of rows) this.events.set(row.id, row)
    const keep = new Set(rows.map((r) => r.id))
    let deleted = 0
    for (const [id, row] of this.events) {
      const day = row.start_date_local.slice(0, 10)
      if (row.athlete_id === athleteId && day >= from && day < toExclusive && !keep.has(id)) {
        this.events.delete(id)
        deleted++
      }
    }
    return Promise.resolve(deleted)
  }
}

// Scripted intervals.icu ------------------------------------------------------

/** Answers a request from its URL; undefined means "no such route". */
export type Resolver = (url: URL, path: string) => unknown

// Each path maps to a JSON body, or to a Response for error cases. Paths not
// listed go to `fallback` when given; anything unanswered is a 404.
export function api(routes: Record<string, unknown>, fallback?: Resolver) {
  const requests: URL[] = []
  const fetch = (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : input)
    requests.push(url)
    const path = url.pathname.replace('/api/v1', '')
    const route = path in routes ? routes[path] : fallback?.(url, path)
    if (route === undefined) return Promise.resolve(new Response('not found', { status: 404 }))
    if (route instanceof Response) return Promise.resolve(route.clone())
    return Promise.resolve(Response.json(route))
  }
  const client = new IcuClient({
    apiKey: 'test-key',
    fetch,
    sleep: () => Promise.resolve(),
    maxRetries: 0,
    log: () => undefined,
  })
  return { client, requests }
}
