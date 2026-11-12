// RatingsStore on Supabase, used by compute-ratings with the service role key
// (which bypasses RLS and may call power_profile).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Benchmark } from '@prolog/metrics'
import { z } from 'zod'
import type {
  BenchmarkSet,
  DurabilityProfileRow,
  PowerProfileRow,
  RatingAttribute,
  RatingRow,
  RatingsStore,
  Rider,
  Vo2maxRow,
} from './ratings.ts'

// An rpc result is untyped, so its rows are checked here.
const powerProfileSchema = z.array(
  z.object({
    athlete_id: z.string(),
    attribute: z.enum(['p5s', 'p30s', 'p1m', 'p5m', 'p20m', 'p60m']),
    best_84d_w: z.number().nullable(),
    best_84d_wkg: z.number().nullable(),
    confidence: z.enum(['high', 'low']).nullable(),
  }),
)

const durabilityProfileSchema = z.array(
  z.object({
    athlete_id: z.string(),
    kj_kg_bucket: z.number(),
    duration_s: z.number(),
    retained_pct: z.number().nullable(),
  }),
)

interface Result<T> {
  data: T | null
  error: { message: string } | null
}

/** Throws on a database error or missing data. */
function rows<T>(result: Result<T>, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`)
  if (result.data === null) throw new Error(`${what}: no data returned`)
  return result.data
}

interface BenchmarkPointRow {
  attribute: RatingAttribute
  method: 'z_score' | 'anchors'
  mean: number | null
  sd: number | null
  anchor_values: number[] | null
  anchor_ratings: number[] | null
}

/** A benchmark_points row as a Benchmark; the table's check keeps the fields in step with the method. */
function toBenchmark(row: BenchmarkPointRow): Benchmark {
  if (row.method === 'z_score' && row.mean !== null && row.sd !== null) {
    return { method: 'z_score', mean: row.mean, sd: row.sd }
  }
  if (row.method === 'anchors' && row.anchor_values && row.anchor_ratings) {
    return {
      method: 'anchors',
      anchorValues: row.anchor_values,
      anchorRatings: row.anchor_ratings,
    }
  }
  throw new Error(`Benchmark for ${row.attribute} does not match its method`)
}

export class SupabaseRatingsStore implements RatingsStore {
  private readonly db: SupabaseClient

  constructor(db: SupabaseClient) {
    this.db = db
  }

  async activeBenchmarks(): Promise<BenchmarkSet | null> {
    const sets = rows(
      await this.db
        .from('benchmark_sets')
        .select('id')
        .eq('is_active', true)
        .overrideTypes<{ id: string }[], { merge: false }>(),
      'read active benchmark set',
    )
    const set = sets[0]
    if (!set) return null
    const points = rows(
      await this.db
        .from('benchmark_points')
        .select('attribute, method, mean, sd, anchor_values, anchor_ratings')
        .eq('set_id', set.id)
        .overrideTypes<BenchmarkPointRow[], { merge: false }>(),
      'read benchmark points',
    )
    return {
      set_id: set.id,
      points: new Map(points.map((point) => [point.attribute, toBenchmark(point)])),
    }
  }

  async riders(): Promise<Rider[]> {
    const [athletes, profiles] = await Promise.all([
      this.db
        .from('athletes')
        .select('id')
        .eq('active', true)
        .overrideTypes<{ id: string }[], { merge: false }>(),
      this.db
        .from('rider_profiles')
        .select('athlete_id, cohort')
        .overrideTypes<{ athlete_id: string; cohort: string }[], { merge: false }>(),
    ])
    const cohorts = new Map(
      rows(profiles, 'read rider profiles').map((profile) => [profile.athlete_id, profile.cohort]),
    )
    // A rider without a profile yet counts as squad, the cohort default.
    return rows(athletes, 'read athletes').map((athlete) => ({
      athlete_id: athlete.id,
      in_squad: (cohorts.get(athlete.id) ?? 'squad') === 'squad',
    }))
  }

  async powerProfile(asOf: string): Promise<PowerProfileRow[]> {
    const result = await this.db
      .rpc('power_profile', { p_as_of: asOf })
      .select('athlete_id, attribute, best_84d_w, best_84d_wkg, confidence')
    if (result.error) throw new Error(`read power profile: ${result.error.message}`)
    return powerProfileSchema.parse(result.data)
  }

  async durabilityProfile(asOf: string): Promise<DurabilityProfileRow[]> {
    const result = await this.db
      .rpc('durability_profile', { p_as_of: asOf })
      .select('athlete_id, kj_kg_bucket, duration_s, retained_pct')
    if (result.error) throw new Error(`read durability profile: ${result.error.message}`)
    return durabilityProfileSchema.parse(result.data)
  }

  async latestVo2max(asOf: string): Promise<Vo2maxRow[]> {
    const tests = rows(
      await this.db
        .from('lab_tests')
        .select('athlete_id, vo2max_ml_kg_min')
        .not('vo2max_ml_kg_min', 'is', null)
        .lte('test_date', asOf)
        // Newest first; on one day a lab test comes before a modelled field test.
        .order('test_date', { ascending: false })
        .order('method', { ascending: true })
        .overrideTypes<Vo2maxRow[], { merge: false }>(),
      'read lab tests',
    )
    const latest = new Map<string, Vo2maxRow>()
    for (const test of tests) {
      if (!latest.has(test.athlete_id)) latest.set(test.athlete_id, test)
    }
    return [...latest.values()]
  }

  async replaceRatings(
    asOf: string,
    setId: string,
    computedAt: string,
    ratings: RatingRow[],
  ): Promise<number> {
    if (ratings.length > 0) {
      const written = await this.db
        .from('rider_ratings')
        .upsert(ratings, { onConflict: 'athlete_id,as_of,set_id,attribute' })
      if (written.error) throw new Error(`upsert rider ratings: ${written.error.message}`)
    }
    const stale = rows(
      await this.db
        .from('rider_ratings')
        .delete()
        .eq('as_of', asOf)
        .eq('set_id', setId)
        .lt('computed_at', computedAt)
        .select('athlete_id'),
      'delete stale rider ratings',
    )
    return stale.length
  }
}
