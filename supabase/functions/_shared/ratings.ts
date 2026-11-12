// compute-ratings (TODO 7.1, KB §6): rates each rider's attributes 1–20 with
// the active benchmark set and squad-relative, and writes rider_ratings.
//
// The formulas live in @prolog/metrics; this file only gathers their inputs.
// Storage sits behind RatingsStore, so there is no IO here.

import { mean, ratingFromBenchmark, squadRatings, type Benchmark } from '@prolog/metrics'

export type RatingAttribute =
  'p5s' | 'p30s' | 'p1m' | 'p5m' | 'p20m' | 'p60m' | 'durability' | 'vo2max'
export type Confidence = 'high' | 'low'

/** Rouleur/TT attributes, also rated on absolute watts within the squad (KB §6–7). */
const ABSOLUTE_WATTS: ReadonlySet<RatingAttribute> = new Set(['p20m', 'p60m'])

/**
 * The retained-% values behind the durability rating: 5 and 20 min after 20
 * and 30 kJ/kg (KB §6). The rating uses the mean of those the rider has
 * (agreed with Kosta, 12 November 2026).
 */
const DURABILITY_DURATIONS_S: readonly number[] = [300, 1200]
const DURABILITY_BUCKETS_KJ_KG: readonly number[] = [20, 30]

// Inputs --------------------------------------------------------------------

export interface BenchmarkSet {
  set_id: string
  points: ReadonlyMap<RatingAttribute, Benchmark>
}
/** An active athlete; `in_squad` is false for prospects and alumni. */
export interface Rider {
  athlete_id: string
  in_squad: boolean
}
/** A power_profile(as_of) row: the 84-day bests the ratings use. */
export interface PowerProfileRow {
  athlete_id: string
  attribute: RatingAttribute
  best_84d_w: number | null
  best_84d_wkg: number | null
  confidence: Confidence | null
}
/** A durability_profile(as_of) row: retained % of fresh power after work, over 84 days. */
export interface DurabilityProfileRow {
  athlete_id: string
  kj_kg_bucket: number
  duration_s: number
  retained_pct: number | null
}
/** A rider's latest lab VO2max on or before the day. */
export interface Vo2maxRow {
  athlete_id: string
  vo2max_ml_kg_min: number
}

// Output --------------------------------------------------------------------

/** A rider_ratings row. */
export interface RatingRow {
  athlete_id: string
  as_of: string
  set_id: string
  attribute: RatingAttribute
  value: number
  rating: number
  squad_rating: number | null
  confidence: Confidence
  watts: number | null
  watts_squad_rating: number | null
  computed_at: string
}

export interface RatingsStore {
  /** The active benchmark set with its points, or null when no set is active. */
  activeBenchmarks(): Promise<BenchmarkSet | null>
  riders(): Promise<Rider[]>
  powerProfile(asOf: string): Promise<PowerProfileRow[]>
  durabilityProfile(asOf: string): Promise<DurabilityProfileRow[]>
  latestVo2max(asOf: string): Promise<Vo2maxRow[]>
  /**
   * Upserts the rows, then deletes the day's other rows for the set (those
   * computed before `computedAt`); returns how many it deleted.
   */
  replaceRatings(
    asOf: string,
    setId: string,
    computedAt: string,
    rows: RatingRow[],
  ): Promise<number>
}

export interface RatingsResult {
  as_of: string
  set_id: string
  riders: number
  ratings: number
  deleted: number
  /** Power bests left unrated because the rider has no body weight for W/kg. */
  without_weight: number
  /** Attributes with values but no benchmark in the active set. */
  without_benchmark: RatingAttribute[]
}

// Rating --------------------------------------------------------------------

interface Rated {
  athlete_id: string
  attribute: RatingAttribute
  value: number
  confidence: Confidence
  watts: number | null
}

/** The squad-relative rating of each squad rider's value; null for everyone else. */
function withinSquad(
  rows: readonly Rated[],
  squad: ReadonlySet<string>,
  pick: (row: Rated) => number | null,
): (number | null)[] {
  return squadRatings(rows.map((row) => (squad.has(row.athlete_id) ? pick(row) : null)))
}

/**
 * Rating rows for one day. Every active rider is rated against the benchmark;
 * squad-relative ratings rank squad riders only, so a prospect never moves
 * them. A power best without W/kg is left out, as is an attribute the set
 * has no benchmark for.
 */
export function rateRiders(input: {
  asOf: string
  computedAt: string
  benchmarks: BenchmarkSet
  riders: readonly Rider[]
  powerProfile: readonly PowerProfileRow[]
  durability: readonly DurabilityProfileRow[]
  vo2max: readonly Vo2maxRow[]
}): { rows: RatingRow[]; withoutWeight: number; withoutBenchmark: RatingAttribute[] } {
  const { asOf, computedAt, benchmarks } = input
  const active = new Set(input.riders.map((rider) => rider.athlete_id))
  const squad = new Set(input.riders.filter((r) => r.in_squad).map((r) => r.athlete_id))

  const byAttribute = new Map<RatingAttribute, Rated[]>()
  const add = (row: Rated) => {
    if (!active.has(row.athlete_id)) return
    const rows = byAttribute.get(row.attribute)
    if (rows) rows.push(row)
    else byAttribute.set(row.attribute, [row])
  }

  let withoutWeight = 0
  for (const row of input.powerProfile) {
    if (row.best_84d_w === null || row.confidence === null) continue // no ride in the window
    if (row.best_84d_wkg === null) {
      if (active.has(row.athlete_id)) withoutWeight++
      continue
    }
    add({
      athlete_id: row.athlete_id,
      attribute: row.attribute,
      value: row.best_84d_wkg,
      confidence: row.confidence,
      watts: ABSOLUTE_WATTS.has(row.attribute) ? row.best_84d_w : null,
    })
  }
  const retained = new Map<string, number[]>()
  for (const row of input.durability) {
    if (
      row.retained_pct === null ||
      !DURABILITY_DURATIONS_S.includes(row.duration_s) ||
      !DURABILITY_BUCKETS_KJ_KG.includes(row.kj_kg_bucket)
    ) {
      continue
    }
    const own = retained.get(row.athlete_id)
    if (own) own.push(row.retained_pct)
    else retained.set(row.athlete_id, [row.retained_pct])
  }
  for (const [athleteId, values] of retained) {
    const value = mean(values)
    if (value === null) continue
    // KB §6 lowers confidence by its days-near-best rule for the power bests only.
    add({ athlete_id: athleteId, attribute: 'durability', value, confidence: 'high', watts: null })
  }
  for (const row of input.vo2max) {
    add({
      athlete_id: row.athlete_id,
      attribute: 'vo2max',
      value: row.vo2max_ml_kg_min,
      // As for durability: no confidence rule in KB §6.
      confidence: 'high',
      watts: null,
    })
  }

  const rows: RatingRow[] = []
  const withoutBenchmark: RatingAttribute[] = []
  for (const [attribute, rated] of byAttribute) {
    const benchmark = benchmarks.points.get(attribute)
    if (!benchmark) {
      withoutBenchmark.push(attribute)
      continue
    }
    const squadRating = withinSquad(rated, squad, (row) => row.value)
    const wattsSquadRating = withinSquad(rated, squad, (row) => row.watts)
    for (const [i, row] of rated.entries()) {
      rows.push({
        athlete_id: row.athlete_id,
        as_of: asOf,
        set_id: benchmarks.set_id,
        attribute,
        value: row.value,
        rating: ratingFromBenchmark(row.value, benchmark),
        squad_rating: squadRating[i] ?? null,
        confidence: row.confidence,
        watts: row.watts,
        watts_squad_rating: wattsSquadRating[i] ?? null,
        computed_at: computedAt,
      })
    }
  }
  return { rows, withoutWeight, withoutBenchmark }
}

// Request -------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The day to rate from a request body: `{"as_of": "YYYY-MM-DD"}`, or today
 * when the body has no `as_of`. A future day is refused.
 */
export function parseAsOf(
  body: unknown,
  today: string,
): { ok: true; asOf: string } | { ok: false; error: string } {
  if (body === null || typeof body !== 'object' || !('as_of' in body)) {
    return { ok: true, asOf: today }
  }
  const asOf = body.as_of
  if (typeof asOf !== 'string' || !ISO_DATE.test(asOf) || Number.isNaN(Date.parse(asOf))) {
    return { ok: false, error: 'as_of must be a date, YYYY-MM-DD' }
  }
  if (asOf > today) return { ok: false, error: 'as_of must not be in the future' }
  return { ok: true, asOf }
}

// Job -----------------------------------------------------------------------

/** Rates every active rider as of a day and replaces that day's rider_ratings. */
export async function runComputeRatings(options: {
  store: RatingsStore
  asOf: string
  now: Date
}): Promise<RatingsResult> {
  const { store, asOf } = options
  const benchmarks = await store.activeBenchmarks()
  if (!benchmarks) throw new Error('No benchmark set is active')

  const [riders, powerProfile, durability, vo2max] = await Promise.all([
    store.riders(),
    store.powerProfile(asOf),
    store.durabilityProfile(asOf),
    store.latestVo2max(asOf),
  ])
  const computedAt = options.now.toISOString()
  const { rows, withoutWeight, withoutBenchmark } = rateRiders({
    asOf,
    computedAt,
    benchmarks,
    riders,
    powerProfile,
    durability,
    vo2max,
  })
  const deleted = await store.replaceRatings(asOf, benchmarks.set_id, computedAt, rows)
  return {
    as_of: asOf,
    set_id: benchmarks.set_id,
    riders: new Set(rows.map((row) => row.athlete_id)).size,
    ratings: rows.length,
    deleted,
    without_weight: withoutWeight,
    without_benchmark: withoutBenchmark,
  }
}
