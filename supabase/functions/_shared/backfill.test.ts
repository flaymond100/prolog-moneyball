import { describe, expect, it } from 'vitest'
import {
  CHUNK_DAYS,
  DAILY_CALL_LIMIT,
  parseBackfillRequest,
  runBackfill,
  type BackfillRequest,
  type BackfillResult,
} from './backfill.ts'
import { addDays } from './sync.ts'
import { FakeStore, api, type Resolver } from './test-helpers.ts'

function days(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

// A squad where every rider rides once a day and logs wellness every day.
function squad(size: number) {
  const ids = Array.from({ length: size }, (_, i) => `i${String(i + 1).padStart(2, '0')}`)
  const window = (url: URL) => {
    const oldest = url.searchParams.get('oldest') ?? ''
    const newest = (url.searchParams.get('newest') ?? '').slice(0, 10)
    return days(oldest, newest)
  }
  const ride = (id: string, day: string) => ({
    id,
    start_date_local: `${day}T09:00:00`,
    source: 'GARMIN_CONNECT',
    analyzed: `${day}T12:00:00`,
  })
  const fallback: Resolver = (url, path) => {
    const list = /^\/athlete\/([^/]+)\/activities$/.exec(path)
    if (list) return window(url).map((day) => ride(`${list[1] ?? ''}-${day}`, day))
    const detail = /^\/athlete\/[^/]+\/activities\/(.+)$/.exec(path)
    if (detail) {
      return (detail[1] ?? '').split(',').map((id) => ({
        ...ride(id, id.slice(-10)),
        icu_intervals: [{ id: 1, type: 'WORK' }],
      }))
    }
    if (/^\/athlete\/[^/]+\/wellness\.json$/.test(path)) {
      return window(url).map((day) => ({ id: day, hrv: 80 }))
    }
    return undefined
  }
  const routes = { '/athlete/0/athlete-summary.json': ids.map((id) => ({ athlete_id: id })) }
  return { ids, connect: () => api(routes, fallback) }
}

const YEAR: BackfillRequest = { from: '2025-11-03', to: '2026-11-02' } // 365 days

describe('runBackfill', () => {
  it('backfills 365 days for 12 riders within the daily call limit (TODO 3.5 AC)', async () => {
    const store = new FakeStore()
    const team = squad(12)
    const result = await runBackfill({ client: team.connect().client, store, request: YEAR })

    expect(result.status).toBe('succeeded')
    expect(result.next).toBeNull()
    expect(result.stopped_by).toBeNull()
    // 13 chunks per rider: twelve of 30 days and one of 5.
    expect(result.counts.chunks).toBe(12 * 13)
    expect(result.counts.activities).toBe(12 * 365)
    expect(store.wellness.size).toBe(12 * 365)
    // Per rider: 12 × (list + 3 detail batches + wellness) + (list + 1 batch + wellness).
    expect(result.api_calls).toBe(1 + 12 * (12 * 5 + 3))
    expect(result.api_calls).toBeLessThan(DAILY_CALL_LIMIT)
    expect(store.runs.get(result.run_id)).toMatchObject({ job: 'backfill', params: YEAR })
  })

  it('cuts the range into 30-day chunks, the last one ending at `to`', async () => {
    const store = new FakeStore()
    const { client, requests } = squad(1).connect()
    await runBackfill({ client, store, request: { from: '2026-01-01', to: '2026-02-05' } })

    const lists = requests.filter((u) => u.pathname.endsWith('/athlete/i01/activities'))
    expect(lists.map((u) => [u.searchParams.get('oldest'), u.searchParams.get('newest')])).toEqual([
      ['2026-01-01', '2026-01-30T23:59:59'],
      ['2026-01-31', '2026-02-05T23:59:59'],
    ])
    expect(CHUNK_DAYS).toBe(30)
  })

  it('stops at the call budget and resumes from `next` without gaps or repeats', async () => {
    const store = new FakeStore()
    const team = squad(3)
    const request: BackfillRequest = { from: '2026-05-01', to: '2026-08-31' }
    const runs: BackfillResult[] = []
    let next: BackfillRequest | null = request
    while (next) {
      const result = await runBackfill({
        client: team.connect().client,
        store,
        request: next,
        maxCalls: 12,
      })
      runs.push(result)
      next = result.next
    }

    expect(runs.length).toBeGreaterThan(2)
    expect(runs.slice(0, -1).every((r) => r.stopped_by === 'call_budget')).toBe(true)
    // A chunk costs at most list + 3 detail batches + wellness = 5 calls past the check.
    expect(runs.every((r) => r.api_calls <= 12 + 4)).toBe(true)
    expect(runs.reduce((n, r) => n + (r.counts.chunks ?? 0), 0)).toBe(3 * 5)
    expect(runs.reduce((n, r) => n + (r.counts.activities ?? 0), 0)).toBe(3 * 123)
    expect(store.activities.size).toBe(3 * 123)
    expect(store.wellness.size).toBe(3 * 123)
  })

  it('stops at the time budget with a resume cursor', async () => {
    const store = new FakeStore()
    let t = 0
    const result = await runBackfill({
      client: squad(1).connect().client,
      store,
      request: { from: '2026-01-01', to: '2026-06-30' },
      clock: () => (t += 10_000),
      timeBudgetMs: 25_000,
    })
    expect(result.stopped_by).toBe('time_budget')
    expect(result.counts.chunks).toBe(2)
    expect(result.next).toEqual({
      from: '2026-01-01',
      to: '2026-06-30',
      resume: { athlete_id: 'i01', from: '2026-03-02' },
    })
  })

  it('leaves room for the nightly sync when calls were already made today', async () => {
    const store = new FakeStore()
    store.callsTodayValue = 4_495 // 5,000 − 500 headroom − 4,495 = 5 calls left
    const result = await runBackfill({ client: squad(2).connect().client, store, request: YEAR })
    expect(result.stopped_by).toBe('call_budget')
    expect(result.counts.chunks).toBe(1)
    expect(result.next?.resume).toEqual({ athlete_id: 'i01', from: '2025-12-03' })
  })

  it('backfills one athlete when `athlete_id` is given, and keeps it in `next`', async () => {
    const store = new FakeStore()
    const { client, requests } = squad(3).connect()
    const result = await runBackfill({
      client,
      store,
      request: { from: '2026-01-01', to: '2026-03-31', athlete_id: 'i02' },
      maxCalls: 3,
    })
    expect(result.athlete_ids).toEqual(['i02'])
    expect(requests.some((u) => u.pathname.includes('/athlete/i01/'))).toBe(false)
    expect(result.next).toMatchObject({ athlete_id: 'i02', resume: { athlete_id: 'i02' } })
  })

  it('resumes mid-squad: earlier riders are skipped, the resumed one starts at its date', async () => {
    const store = new FakeStore()
    const { client, requests } = squad(3).connect()
    const result = await runBackfill({
      client,
      store,
      request: {
        from: '2026-01-01',
        to: '2026-01-30',
        resume: { athlete_id: 'i02', from: '2026-01-15' },
      },
    })
    expect(result.athlete_ids).toEqual(['i02', 'i03'])
    const oldest = (id: string) =>
      requests
        .find((u) => u.pathname.endsWith(`/athlete/${id}/activities`))
        ?.searchParams.get('oldest')
    expect(oldest('i01')).toBeUndefined()
    expect(oldest('i02')).toBe('2026-01-15')
    expect(oldest('i03')).toBe('2026-01-01')
  })

  it('fails without touching data for an unknown athlete or resume cursor', async () => {
    for (const request of [
      { from: '2026-01-01', to: '2026-01-30', athlete_id: 'i99' },
      { from: '2026-01-01', to: '2026-01-30', resume: { athlete_id: 'i99', from: '2026-01-01' } },
    ]) {
      const store = new FakeStore()
      const result = await runBackfill({ client: squad(2).connect().client, store, request })
      expect(result.status).toBe('failed')
      expect(result.errors[0]).toMatchObject({ athlete_id: null, step: 'setup' })
      expect(store.activities.size).toBe(0)
    }
  })

  it('records a failing chunk and carries on', async () => {
    const store = new FakeStore()
    const { client } = api({
      '/athlete/0/athlete-summary.json': [{ athlete_id: 'i01' }],
      '/athlete/i01/activities': [],
      '/athlete/i01/wellness.json': new Response('boom', { status: 500 }),
    })
    const result = await runBackfill({
      client,
      store,
      request: { from: '2026-01-01', to: '2026-02-28' },
    })
    expect(result.counts.chunks).toBe(2)
    expect(result.errors.map((e) => e.step)).toEqual([
      'wellness 2026-01-01..2026-01-30',
      'wellness 2026-01-31..2026-02-28',
    ])
    expect(result.status).toBe('failed')
  })
})

describe('parseBackfillRequest', () => {
  const today = '2026-11-02'

  it('accepts a range, an athlete and a resume cursor', () => {
    const body = {
      from: '2026-01-01',
      to: '2026-11-02',
      athlete_id: 'i1',
      resume: { athlete_id: 'i1', from: '2026-03-01' },
    }
    expect(parseBackfillRequest(body, today)).toEqual({ ok: true, request: body })
  })

  it('rejects a reversed range, a future end, a bad date and a cursor outside the range', () => {
    const errors = [
      { from: '2026-02-01', to: '2026-01-01' },
      { from: '2026-01-01', to: '2026-11-03' },
      { from: '1 January 2026', to: '2026-01-31' },
      { from: '2026-01-01', to: '2026-01-31', resume: { athlete_id: 'i1', from: '2026-02-01' } },
      'not json',
    ].map((body) => parseBackfillRequest(body, today))
    expect(errors.every((r) => !r.ok)).toBe(true)
    expect(errors[1]).toEqual({ ok: false, error: '`to` cannot be in the future.' })
  })
})
