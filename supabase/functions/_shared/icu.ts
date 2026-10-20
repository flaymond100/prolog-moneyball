// intervals.icu API client (KB §4), shared by sync-nightly and backfill.
//
// - Basic auth with username `API_KEY` and the coach key as password.
// - Throttles request starts to at most 5 per second.
// - Retries 429 (honouring Retry-After), 5xx and network errors with
//   exponential back-off; other 4xx fail at once.
// - Logs every response with any rate-limit headers, and keeps the last
//   "remaining" value and the call count for the sync_runs row.
// - Validates the fields the sync relies on with zod, but loose objects keep
//   every other field, so the parsed value is the full JSON for `raw`.
//
// Web-standard APIs only (fetch, setTimeout, btoa), so Vitest can run it under
// Node. Deno resolves the bare `zod` import through the function's deno.json.

import { z } from 'zod'

export const ICU_BASE_URL = 'https://intervals.icu/api/v1'

// Engineering constants, not domain priors.
const DEFAULT_MAX_REQUESTS_PER_SECOND = 5 // KB §4: throttle to ≤5 calls/s
const DEFAULT_MAX_RETRIES = 5
const BACKOFF_BASE_MS = 1_000
const BACKOFF_MAX_MS = 60_000

// Known fields --------------------------------------------------------------
// Only what the sync needs to key and route rows. No transforms, so the parsed
// object equals the response. Field names are confirmed against the live API
// in TODO 3.3.

const icuId = z.union([z.string(), z.number()])

export const icuAthleteSummarySchema = z.array(
  z.looseObject({ id: icuId, name: z.string().nullish() }),
)

export const icuActivitySchema = z.looseObject({
  id: icuId,
  start_date_local: z.string(),
  source: z.string().nullish(),
  icu_intervals: z.array(z.looseObject({ id: icuId })).nullish(),
})
export const icuActivitiesSchema = z.array(icuActivitySchema)

// Wellness `id` is the local date, YYYY-MM-DD.
export const icuWellnessSchema = z.array(z.looseObject({ id: z.string() }))

export const icuEventsSchema = z.array(
  z.looseObject({ id: icuId, start_date_local: z.string(), category: z.string().nullish() }),
)

export type IcuActivity = z.infer<typeof icuActivitySchema>

// Errors --------------------------------------------------------------------

export class IcuHttpError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: string,
  ) {
    super(`intervals.icu ${path} failed with HTTP ${status}`)
    this.name = 'IcuHttpError'
  }
}

export class IcuValidationError extends Error {
  constructor(
    readonly path: string,
    readonly issues: z.core.$ZodIssue[],
  ) {
    super(
      `intervals.icu ${path} returned unexpected JSON: ${z.prettifyError(new z.ZodError(issues))}`,
    )
    this.name = 'IcuValidationError'
  }
}

// Client --------------------------------------------------------------------

export interface IcuLogEvent {
  path: string
  attempt: number
  status: number | null // null when the request itself failed
  waitMs: number | null // back-off before the next attempt, if any
  rateLimit: Record<string, string>
}

export interface IcuClientOptions {
  apiKey: string
  baseUrl?: string
  maxRequestsPerSecond?: number
  maxRetries?: number
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  log?: (event: IcuLogEvent) => void
}

export type IcuQuery = Record<string, string | number | boolean | undefined>

export class IcuClient {
  /** Requests sent, retries included (for sync_runs.api_calls). */
  calls = 0
  /** Last rate-limit "remaining" header value seen (for sync_runs.rate_limit_remaining). */
  rateLimitRemaining: number | null = null

  private readonly authorization: string
  private readonly baseUrl: string
  private readonly minIntervalMs: number
  private readonly maxRetries: number
  private readonly fetchFn: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>
  private readonly now: () => number
  private readonly log: (event: IcuLogEvent) => void
  private nextStart = 0

  constructor(options: IcuClientOptions) {
    if (!options.apiKey) throw new Error('intervals.icu API key is missing')
    this.authorization = `Basic ${btoa(`API_KEY:${options.apiKey}`)}`
    this.baseUrl = options.baseUrl ?? ICU_BASE_URL
    this.minIntervalMs = 1_000 / (options.maxRequestsPerSecond ?? DEFAULT_MAX_REQUESTS_PER_SECOND)
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    this.fetchFn = options.fetch ?? ((input, init) => fetch(input, init))
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.now = options.now ?? Date.now
    this.log =
      options.log ??
      ((event) => {
        console.info(JSON.stringify({ icu: event }))
      })
  }

  /** GET a JSON endpoint and validate it. `path` starts with a slash, e.g. `/athlete/0/athlete-summary.json`. */
  async get<S extends z.ZodType>(
    path: string,
    schema: S,
    query: IcuQuery = {},
  ): Promise<z.infer<S>> {
    const json = await this.request(path, query)
    const result = schema.safeParse(json)
    if (!result.success) throw new IcuValidationError(path, result.error.issues)
    return result.data
  }

  private async request(path: string, query: IcuQuery): Promise<unknown> {
    const url = new URL(this.baseUrl + path)
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }

    for (let attempt = 1; ; attempt++) {
      await this.throttle()
      this.calls++

      let response: Response
      try {
        response = await this.fetchFn(url, {
          headers: { Authorization: this.authorization, Accept: 'application/json' },
        })
      } catch (error) {
        // Network failure: retry like a 5xx.
        if (attempt > this.maxRetries) throw error
        const waitMs = this.backoffMs(attempt)
        this.log({ path, attempt, status: null, waitMs, rateLimit: {} })
        await this.sleep(waitMs)
        continue
      }

      const rateLimit = this.readRateLimit(response.headers)
      if (response.ok) {
        this.log({ path, attempt, status: response.status, waitMs: null, rateLimit })
        return response.json()
      }

      const retryable = response.status === 429 || response.status >= 500
      if (!retryable || attempt > this.maxRetries) {
        this.log({ path, attempt, status: response.status, waitMs: null, rateLimit })
        throw new IcuHttpError(response.status, path, (await response.text()).slice(0, 500))
      }

      const waitMs = Math.max(this.backoffMs(attempt), this.retryAfterMs(response.headers) ?? 0)
      this.log({ path, attempt, status: response.status, waitMs, rateLimit })
      await this.sleep(waitMs)
    }
  }

  private backoffMs(attempt: number): number {
    return Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS)
  }

  // Reserves the next start slot before awaiting, so concurrent callers queue.
  private async throttle(): Promise<void> {
    const now = this.now()
    const start = Math.max(now, this.nextStart)
    this.nextStart = start + this.minIntervalMs
    if (start > now) await this.sleep(start - now)
  }

  // Header names are confirmed in TODO 3.3; collect any rate-limit header.
  private readRateLimit(headers: Headers): Record<string, string> {
    const found: Record<string, string> = {}
    headers.forEach((value, name) => {
      if (!/rate-?limit/i.test(name)) return
      found[name] = value
      const remaining = Number(value)
      if (/remaining/i.test(name) && Number.isFinite(remaining)) this.rateLimitRemaining = remaining
    })
    return found
  }

  // Retry-After is either seconds or an HTTP date.
  private retryAfterMs(headers: Headers): number | null {
    const value = headers.get('retry-after')
    if (value === null) return null
    const seconds = Number(value)
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000)
    const date = Date.parse(value)
    return Number.isNaN(date) ? null : Math.max(0, date - this.now())
  }
}
