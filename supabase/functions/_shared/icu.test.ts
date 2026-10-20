import { describe, expect, it, vi } from 'vitest'
import {
  IcuClient,
  IcuHttpError,
  IcuValidationError,
  icuActivitiesSchema,
  icuAthleteSummarySchema,
  icuWellnessSchema,
  type IcuClientOptions,
  type IcuLogEvent,
} from './icu.ts'

type Reply = Response | Error

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

// A client with a scripted fetch, a fake clock and a sleep that advances it.
function setup(replies: Reply[], options: Partial<IcuClientOptions> = {}) {
  let clock = 1_000_000
  const sleeps: number[] = []
  const logs: IcuLogEvent[] = []
  const fetch = vi.fn<typeof globalThis.fetch>(() => {
    const reply = replies.shift()
    if (!reply) throw new Error('unexpected request')
    return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply)
  })
  const client = new IcuClient({
    apiKey: 'secret-key',
    fetch,
    now: () => clock,
    sleep: (ms) => {
      sleeps.push(ms)
      clock += ms
      return Promise.resolve()
    },
    log: (event) => logs.push(event),
    ...options,
  })
  return { client, fetch, sleeps, logs, advance: (ms: number) => (clock += ms) }
}

describe('IcuClient: 200', () => {
  it('sends basic auth with username API_KEY and builds the URL', async () => {
    const { client, fetch } = setup([json([{ id: 'i1', name: 'Rider One' }])])
    await client.get('/athlete/0/athlete-summary.json', icuAthleteSummarySchema, {
      oldest: '2026-10-16',
      newest: undefined,
    })

    const [url, init] = fetch.mock.calls[0] ?? []
    expect((url as URL).href).toBe(
      'https://intervals.icu/api/v1/athlete/0/athlete-summary.json?oldest=2026-10-16',
    )
    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBe(`Basic ${btoa('API_KEY:secret-key')}`)
    expect(headers.get('accept')).toBe('application/json')
  })

  it('keeps every field of the response, not just the validated ones', async () => {
    const activity = {
      id: 'a1',
      start_date_local: '2026-10-19T09:00:00',
      source: 'GARMIN_CONNECT',
      icu_training_load: 85,
      icu_zone_times: [{ id: 'Z1', secs: 600 }],
    }
    const { client } = setup([json([activity])])
    await expect(client.get('/athlete/i1/activities', icuActivitiesSchema)).resolves.toEqual([
      activity,
    ])
  })

  it('counts calls and records the rate-limit headers', async () => {
    const { client, logs } = setup([
      json([], 200, { 'X-RateLimit-Remaining': '4980', 'X-RateLimit-Limit': '5000' }),
    ])
    await client.get('/athlete/i1/wellness', icuWellnessSchema)

    expect(client.calls).toBe(1)
    expect(client.rateLimitRemaining).toBe(4980)
    expect(logs).toEqual([
      {
        path: '/athlete/i1/wellness',
        attempt: 1,
        status: 200,
        waitMs: null,
        rateLimit: { 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '4980' },
      },
    ])
  })

  it('leaves the remaining count unset when no header is numeric', async () => {
    const { client } = setup([json([], 200, { 'X-RateLimit-Remaining': 'n/a' })])
    await client.get('/athlete/i1/wellness', icuWellnessSchema)
    expect(client.rateLimitRemaining).toBeNull()
  })

  it('never logs the API key', async () => {
    const { client, logs } = setup([json({ error: 'boom' }, 500), json([])])
    await client.get('/athlete/i1/wellness', icuWellnessSchema)
    expect(JSON.stringify(logs)).not.toContain('secret-key')
  })

  it('rejects a missing API key', () => {
    expect(() => new IcuClient({ apiKey: '' })).toThrow('API key is missing')
  })
})

describe('IcuClient: throttling', () => {
  it('spaces request starts to at most 5 per second', async () => {
    const { client, sleeps } = setup([json([]), json([]), json([])])
    await client.get('/a', icuWellnessSchema)
    await client.get('/b', icuWellnessSchema)
    await client.get('/c', icuWellnessSchema)
    expect(sleeps).toEqual([200, 200])
  })

  it('queues concurrent requests into separate slots', async () => {
    // All three reserve a slot before any sleep resolves, so the clock stands still.
    const sleeps: number[] = []
    const sleep = (ms: number) => {
      sleeps.push(ms)
      return Promise.resolve()
    }
    const { client } = setup([json([]), json([]), json([])], { sleep })
    await Promise.all([
      client.get('/a', icuWellnessSchema),
      client.get('/b', icuWellnessSchema),
      client.get('/c', icuWellnessSchema),
    ])
    expect(sleeps).toEqual([200, 400])
  })

  it('does not wait once the slot has passed', async () => {
    const { client, sleeps, advance } = setup([json([]), json([])])
    await client.get('/a', icuWellnessSchema)
    advance(500)
    await client.get('/b', icuWellnessSchema)
    expect(sleeps).toEqual([])
  })
})

describe('IcuClient: 429', () => {
  it('waits for Retry-After in seconds, then succeeds', async () => {
    const { client, sleeps, logs } = setup([
      json({}, 429, { 'Retry-After': '7' }),
      json([{ id: '2026-10-19' }]),
    ])
    await expect(client.get('/athlete/i1/wellness', icuWellnessSchema)).resolves.toEqual([
      { id: '2026-10-19' },
    ])
    expect(sleeps).toEqual([7_000])
    expect(client.calls).toBe(2)
    expect(logs.map((l) => [l.status, l.waitMs])).toEqual([
      [429, 7_000],
      [200, null],
    ])
  })

  it('waits for a Retry-After HTTP date', async () => {
    const { client, sleeps } = setup([
      json({}, 429, { 'Retry-After': new Date(1_000_000 + 30_000).toUTCString() }),
      json([]),
    ])
    await client.get('/x', icuWellnessSchema)
    // HTTP dates have whole-second precision.
    expect(sleeps[0]).toBeGreaterThanOrEqual(29_000)
    expect(sleeps[0]).toBeLessThanOrEqual(30_000)
  })

  it('backs off exponentially without Retry-After, or when it is shorter or unreadable', async () => {
    const { client, sleeps } = setup([
      json({}, 429),
      json({}, 429, { 'Retry-After': '1' }),
      json({}, 429, { 'Retry-After': 'soon' }),
      json([]),
    ])
    await client.get('/x', icuWellnessSchema)
    expect(sleeps).toEqual([1_000, 2_000, 4_000])
  })

  it('gives up after the retry limit with the status', async () => {
    const { client, fetch } = setup(
      [json({}, 429), json({}, 429), json({ message: 'slow down' }, 429)],
      { maxRetries: 2 },
    )
    const error = await client.get('/x', icuWellnessSchema).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IcuHttpError)
    expect(error).toMatchObject({ status: 429, path: '/x', body: '{"message":"slow down"}' })
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})

describe('IcuClient: 5xx and network errors', () => {
  it('retries a 5xx with back-off, then succeeds', async () => {
    const { client, sleeps } = setup([json({}, 502), json({}, 503), json([])])
    await client.get('/x', icuWellnessSchema)
    expect(sleeps).toEqual([1_000, 2_000])
    expect(client.calls).toBe(3)
  })

  it('caps the back-off at 60 s', async () => {
    const replies = [...Array.from({ length: 8 }, () => json({}, 500)), json([])]
    const { client, sleeps } = setup(replies, { maxRetries: 8 })
    await client.get('/x', icuWellnessSchema)
    expect(sleeps).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000])
  })

  it('throws after the retry limit', async () => {
    const { client } = setup([json({}, 500), json({}, 500)], { maxRetries: 1 })
    await expect(client.get('/x', icuWellnessSchema)).rejects.toMatchObject({ status: 500 })
  })

  it('retries a network error, then succeeds', async () => {
    const { client, sleeps, logs } = setup([new TypeError('fetch failed'), json([])])
    await client.get('/x', icuWellnessSchema)
    expect(sleeps).toEqual([1_000])
    expect(logs[0]).toMatchObject({ status: null, waitMs: 1_000 })
  })

  it('rethrows a network error after the retry limit', async () => {
    const { client } = setup([new TypeError('fetch failed'), new TypeError('fetch failed')], {
      maxRetries: 1,
    })
    await expect(client.get('/x', icuWellnessSchema)).rejects.toThrow('fetch failed')
  })
})

describe('IcuClient: other failures', () => {
  it('does not retry a 4xx other than 429', async () => {
    const { client, fetch, sleeps } = setup([json({ error: 'not found' }, 404)])
    await expect(client.get('/athlete/i9/wellness', icuWellnessSchema)).rejects.toThrow(
      'intervals.icu /athlete/i9/wellness failed with HTTP 404',
    )
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(sleeps).toEqual([])
  })

  it('rejects JSON missing a required field, without retrying', async () => {
    const { client, fetch } = setup([json([{ id: 'a1' }])])
    const error = await client
      .get('/athlete/i1/activities', icuActivitiesSchema)
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IcuValidationError)
    expect((error as IcuValidationError).message).toContain('start_date_local')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
