import { describe, expect, it } from 'vitest'
import { cronSecretMatches } from './cron-auth.ts'
import {
  activityVersion,
  addDays,
  latestSummaryPerAthlete,
  runNightlySync,
  splitCycleFields,
} from './sync.ts'
import { FakeStore, api } from './test-helpers.ts'

const TODAY = '2026-11-02'

const ride = (id: string, analyzed: string, source = 'GARMIN_CONNECT') => ({
  id,
  start_date_local: '2026-11-01T09:00:00',
  source,
  analyzed,
  icu_training_load: 80,
})

function squadApi(overrides: Record<string, unknown> = {}) {
  return api({
    '/athlete/0/athlete-summary.json': [
      { athlete_id: 'i1', athlete_name: 'Rider One', weight: 58 },
    ],
    '/athlete/i1/activities': [
      ride('a1', '2026-11-01T10:00:00'),
      ride('a2', '2026-10-31T10:00:00'),
      ride('s1', '2026-10-31T10:00:00', 'STRAVA'),
    ],
    '/athlete/i1/activities/a1,a2': [
      {
        ...ride('a1', '2026-11-01T10:00:00'),
        icu_intervals: [
          { id: 1, type: 'WORK' },
          { id: 2, type: 'RECOVERY' },
        ],
        icu_groups: [{ id: 'g1' }],
      },
      { ...ride('a2', '2026-10-31T10:00:00'), icu_intervals: [] },
    ],
    '/athlete/i1/wellness.json': [
      { id: '2026-11-01', hrv: 82, menstrualPhase: 'FOLLICULAR', menstrualPhasePredicted: null },
      { id: '2026-11-02', hrv: 79 },
    ],
    '/athlete/i1/power-curves.json': {
      list: [
        { id: '42d', secs: [5, 60], values: [900, 420], watts_per_kg: [15.5, 7.2] },
        { id: '84d', secs: [5, 60], values: [910, 425], watts_per_kg: [15.7] },
        { id: 'r.2026-10-01.2026-11-02', secs: [5], values: [905], watts_per_kg: [15.6] },
        { id: '1y', secs: [5], values: [950] },
      ],
    },
    '/athlete/i1/events.json': [
      {
        id: 501,
        start_date_local: '2026-11-05T00:00:00',
        category: 'WORKOUT',
        icu_training_load: 95,
      },
      { id: 502, start_date_local: '2026-11-21T00:00:00', category: 'RACE_A' },
    ],
    ...overrides,
  })
}

// Tests ---------------------------------------------------------------------

describe('runNightlySync', () => {
  it('syncs every step for each athlete and logs a succeeded run', async () => {
    const store = new FakeStore()
    const { client, requests } = squadApi()
    const result = await runNightlySync({ client, store, today: TODAY, now: () => 't' })

    expect(result.status).toBe('succeeded')
    expect(result.errors).toEqual([])
    expect(result.athlete_ids).toEqual(['i1'])
    expect(result.counts).toEqual({
      athletes: 1,
      athletes_deactivated: 0,
      activities_skipped_strava: 1,
      activities_unchanged: 0,
      activities: 2,
      activity_intervals: 2,
      wellness: 2,
      cycle_data: 0,
      power_curves: 3,
      planned_events: 2,
      planned_events_deleted: 0,
    })
    expect(result.api_calls).toBe(requests.length)
    expect(store.runs.get(result.run_id)?.result?.status).toBe('succeeded')

    // Request windows: activities and wellness from today − 4, events for 56 days.
    const query = (path: string) => requests.find((u) => u.pathname.endsWith(path))?.searchParams
    expect(query('/athlete/i1/activities')?.get('oldest')).toBe('2026-10-29')
    expect(query('/athlete/i1/activities')?.get('newest')).toBe(`${TODAY}T23:59:59`)
    expect(query('/wellness.json')?.get('oldest')).toBe('2026-10-29')
    expect(query('/events.json')?.get('oldest')).toBe(TODAY)
    expect(query('/events.json')?.get('newest')).toBe('2026-12-28')
    expect(query('/events.json')?.get('category')).toBe('WORKOUT,RACE_A,RACE_B,RACE_C')
    expect(query('/power-curves.json')?.get('curves')).toBe('42d,84d,r.2026-10-01.2026-11-02')
    expect(query('/power-curves.json')?.get('type')).toBe('Ride')
    expect(query('/activities/a1,a2')?.get('intervals')).toBe('true')
  })

  it('stores athletes, and activities without their intervals and groups', async () => {
    const store = new FakeStore()
    await runNightlySync({ client: squadApi().client, store, today: TODAY })

    expect(store.athletes.get('i1')).toMatchObject({ name: 'Rider One', active: true })
    const a1 = store.activities.get('a1')
    expect(a1).toMatchObject({ athlete_id: 'i1', start_date_local: '2026-11-01T09:00:00' })
    expect(a1?.raw).not.toHaveProperty('icu_intervals')
    expect(a1?.raw).not.toHaveProperty('icu_groups')
    expect(a1?.raw).toHaveProperty('icu_training_load', 80)
    expect(store.intervals.get('a1')).toEqual([
      { interval_id: 1, raw: { id: 1, type: 'WORK' } },
      { interval_id: 2, raw: { id: 2, type: 'RECOVERY' } },
    ])
    expect(store.activities.has('s1')).toBe(false)
  })

  it('maps curves to windows, drops unknown ones, and nulls mismatched W/kg', async () => {
    const store = new FakeStore()
    await runNightlySync({ client: squadApi().client, store, today: TODAY })

    expect([...store.curves.keys()]).toEqual([
      'i1/2026-11-02/42d',
      'i1/2026-11-02/84d',
      'i1/2026-11-02/season',
    ])
    expect(store.curves.get('i1/2026-11-02/42d')).toMatchObject({
      watts: [900, 420],
      wkg: [15.5, 7.2],
    })
    expect(store.curves.get('i1/2026-11-02/84d')?.wkg).toBeNull()
  })

  it('stores planned workouts and races with string ids', async () => {
    const store = new FakeStore()
    await runNightlySync({ client: squadApi().client, store, today: TODAY })
    expect([...store.events.keys()]).toEqual(['501', '502'])
    expect(store.events.get('502')?.raw).toMatchObject({ category: 'RACE_A' })
  })

  it('is idempotent: a second run fetches no unchanged details and changes nothing', async () => {
    const store = new FakeStore()
    await runNightlySync({ client: squadApi().client, store, today: TODAY, now: () => 't' })
    const snapshot = JSON.stringify([
      [...store.activities],
      [...store.intervals],
      [...store.wellness],
      [...store.curves],
      [...store.events],
      [...store.athletes],
    ])
    const writes = store.activityWrites

    const second = squadApi()
    const result = await runNightlySync({
      client: second.client,
      store,
      today: TODAY,
      now: () => 't',
    })

    expect(result.status).toBe('succeeded')
    expect(result.counts.activities_unchanged).toBe(2)
    expect(result.counts.activities ?? 0).toBe(0)
    expect(second.requests.some((u) => u.pathname.includes('/activities/a1'))).toBe(false)
    expect(store.activityWrites).toBe(writes)
    expect(
      JSON.stringify([
        [...store.activities],
        [...store.intervals],
        [...store.wellness],
        [...store.curves],
        [...store.events],
        [...store.athletes],
      ]),
    ).toBe(snapshot)
  })

  it('re-fetches an activity that intervals.icu re-analysed', async () => {
    const store = new FakeStore()
    await runNightlySync({ client: squadApi().client, store, today: TODAY })
    const { client, requests } = squadApi({
      '/athlete/i1/activities': [
        ride('a1', '2026-11-02T08:00:00'),
        ride('a2', '2026-10-31T10:00:00'),
      ],
      '/athlete/i1/activities/a1': [
        { ...ride('a1', '2026-11-02T08:00:00'), icu_intervals: [{ id: 1 }] },
      ],
    })
    const result = await runNightlySync({ client, store, today: TODAY })
    expect(result.counts.activities).toBe(1)
    expect(requests.some((u) => u.pathname.endsWith('/activities/a1'))).toBe(true)
    expect(store.intervals.get('a1')).toHaveLength(1)
  })

  it('deletes planned events that disappeared from intervals.icu', async () => {
    const store = new FakeStore()
    await runNightlySync({ client: squadApi().client, store, today: TODAY })
    const { client } = squadApi({
      '/athlete/i1/events.json': [
        { id: 502, start_date_local: '2026-11-21T00:00:00', category: 'RACE_A' },
      ],
    })
    const result = await runNightlySync({ client, store, today: TODAY })
    expect(result.counts.planned_events_deleted).toBe(1)
    expect([...store.events.keys()]).toEqual(['502'])
  })

  // Seen live on 2 November 2026: one row per athlete and period.
  it('syncs an athlete listed in several summary periods once', async () => {
    const store = new FakeStore()
    const { client, requests } = squadApi({
      '/athlete/0/athlete-summary.json': [
        { athlete_id: 'i1', athlete_name: 'Rider One', date: '2026-10-26' },
        { athlete_id: 'i1', athlete_name: 'Rider One', date: '2026-11-02' },
      ],
    })
    const result = await runNightlySync({ client, store, today: TODAY })
    expect(result.status).toBe('succeeded')
    expect(result.athlete_ids).toEqual(['i1'])
    expect(result.counts.athletes).toBe(1)
    expect(store.athletes.get('i1')?.raw).toMatchObject({ date: '2026-11-02' })
    expect(requests.filter((u) => u.pathname.endsWith('/athlete/i1/wellness.json'))).toHaveLength(1)
  })

  it('marks athletes missing from the summary inactive', async () => {
    const store = new FakeStore()
    store.athletes.set('old', { id: 'old', name: 'Old', active: true, raw: {}, synced_at: 't' })
    const result = await runNightlySync({ client: squadApi().client, store, today: TODAY })
    expect(result.counts.athletes_deactivated).toBe(1)
    expect(store.athletes.get('old')?.active).toBe(false)
  })

  it('leaves athletes alone when the summary is empty', async () => {
    const store = new FakeStore()
    store.athletes.set('i1', { id: 'i1', name: 'Rider One', active: true, raw: {}, synced_at: 't' })
    const { client } = api({ '/athlete/0/athlete-summary.json': [] })
    const result = await runNightlySync({ client, store, today: TODAY })
    expect(result.status).toBe('succeeded')
    expect(store.athletes.get('i1')?.active).toBe(true)
  })

  it('skips the season curve while the season has not started', async () => {
    const store = new FakeStore()
    store.season = '2026-12-01'
    const { client, requests } = squadApi()
    await runNightlySync({ client, store, today: TODAY })
    const curves = requests.find((u) => u.pathname.endsWith('/power-curves.json'))
    expect(curves?.searchParams.get('curves')).toBe('42d,84d')
  })
})

describe('runNightlySync: cycle data (KB §11)', () => {
  it('never keeps cycle fields without consent', async () => {
    const store = new FakeStore()
    await runNightlySync({ client: squadApi().client, store, today: TODAY })
    expect(store.cycle.size).toBe(0)
    for (const row of store.wellness.values()) {
      expect(row.raw).not.toHaveProperty('menstrualPhase')
      expect(row.raw).not.toHaveProperty('menstrualPhasePredicted')
    }
  })

  it('routes cycle fields to cycle_data with an active consent', async () => {
    const store = new FakeStore()
    store.consents.add('i1')
    const result = await runNightlySync({ client: squadApi().client, store, today: TODAY })
    expect(result.counts.cycle_data).toBe(1)
    expect(store.cycle.get('i1/2026-11-01')?.raw).toEqual({ menstrualPhase: 'FOLLICULAR' })
    expect(store.wellness.get('i1/2026-11-01')?.raw).toEqual({ id: '2026-11-01', hrv: 82 })
  })
})

describe('runNightlySync: failures', () => {
  it('records a failing step and carries on with the other steps and riders', async () => {
    const store = new FakeStore()
    const { client } = squadApi({
      '/athlete/0/athlete-summary.json': [{ athlete_id: 'i1' }, { athlete_id: 'i2' }],
      '/athlete/i1/power-curves.json': new Response('boom', { status: 500 }),
      '/athlete/i2/activities': [],
      '/athlete/i2/wellness.json': [],
      '/athlete/i2/power-curves.json': { list: [] },
      '/athlete/i2/events.json': [],
    })
    const result = await runNightlySync({ client, store, today: TODAY })

    expect(result.status).toBe('partial')
    expect(result.errors).toEqual([
      {
        athlete_id: 'i1',
        step: 'power_curves',
        message: 'intervals.icu /athlete/i1/power-curves.json failed with HTTP 500',
      },
    ])
    expect(result.counts.planned_events).toBe(2)
    expect(store.athletes.get('i1')?.name).toBe('i1')
    expect(JSON.stringify(result)).not.toContain('test-key')
  })

  it('fails the run when every rider fails', async () => {
    const store = new FakeStore()
    const { client } = api({ '/athlete/0/athlete-summary.json': [{ athlete_id: 'i1' }] })
    const result = await runNightlySync({ client, store, today: TODAY })
    expect(result.status).toBe('failed')
    expect(result.errors.map((e) => e.step)).toEqual([
      'activities',
      'wellness',
      'power_curves',
      'planned_events',
    ])
  })

  it('fails and still logs the run when the summary cannot be read', async () => {
    const store = new FakeStore()
    const { client } = api({
      '/athlete/0/athlete-summary.json': new Response('down', { status: 503 }),
    })
    const result = await runNightlySync({ client, store, today: TODAY })
    expect(result.status).toBe('failed')
    expect(result.errors[0]).toMatchObject({ athlete_id: null, step: 'setup' })
    expect(store.runs.get(result.run_id)?.result?.status).toBe('failed')
  })
})

describe('helpers', () => {
  it('latestSummaryPerAthlete keeps the newest row per athlete, in first-seen order', () => {
    const rows = [
      { athlete_id: 'i2', date: '2026-11-02' },
      { athlete_id: 'i1', date: '2026-11-02' },
      { athlete_id: 'i2', date: '2026-10-26' },
      { athlete_id: 'i1' },
    ]
    expect(latestSummaryPerAthlete(rows)).toEqual([
      { athlete_id: 'i2', date: '2026-11-02' },
      { athlete_id: 'i1', date: '2026-11-02' },
    ])
  })

  it('addDays crosses month ends in UTC', () => {
    expect(addDays('2026-10-30', 4)).toBe('2026-11-03')
    expect(addDays('2026-11-02', -4)).toBe('2026-10-29')
  })

  it('activityVersion prefers analyzed, then icu_sync_date', () => {
    expect(activityVersion({ analyzed: 'x', icu_sync_date: 'y' })).toBe('x')
    expect(activityVersion({ analyzed: '', icu_sync_date: 'y' })).toBe('y')
    expect(activityVersion({ analyzed: null })).toBeNull()
  })

  it('splitCycleFields keeps only set cycle fields', () => {
    expect(splitCycleFields({ id: 'd', menstrualPhase: null })).toEqual({
      wellness: { id: 'd' },
      cycle: null,
    })
    expect(splitCycleFields({ id: 'd', menstrualPhasePredicted: 'LUTEAL' })).toEqual({
      wellness: { id: 'd' },
      cycle: { menstrualPhasePredicted: 'LUTEAL' },
    })
  })
})

describe('cronSecretMatches', () => {
  const request = (secret?: string) =>
    new Request('https://x', { method: 'POST', headers: secret ? { 'x-cron-secret': secret } : {} })

  it('accepts the exact secret', () => {
    expect(cronSecretMatches(request('s3cret'), 's3cret')).toBe(true)
  })

  it('rejects a wrong, missing or differently sized secret', () => {
    expect(cronSecretMatches(request('s3creT'), 's3cret')).toBe(false)
    expect(cronSecretMatches(request(), 's3cret')).toBe(false)
    expect(cronSecretMatches(request('s3cret!'), 's3cret')).toBe(false)
  })

  it('rejects everything when no secret is configured', () => {
    expect(cronSecretMatches(request(''), '')).toBe(false)
    expect(cronSecretMatches(request('x'), undefined)).toBe(false)
  })
})
