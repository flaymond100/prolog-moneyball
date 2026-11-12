import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@prolog/types'
import type { AttributeId, AttributeRating, CaPa } from '@/data/types.ts'

// Reads the Phase 7 outputs for the views (TODO 4.3): the latest ratings of
// the active benchmark set with their 28-day change, and the latest rider
// type and CA. The nightly job writes every rider on the same day, so "latest"
// is one day for the whole squad.

type Client = SupabaseClient<Database>

const CHANGE_DAYS = 28

export interface ModelOutputs {
  /** Rated attributes per rider; an attribute without a rating is absent. */
  ratings: Map<string, Partial<Record<AttributeId, AttributeRating>>>
  caPa: Map<string, CaPa>
}

function daysBefore(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`)
  if (result.data === null) throw new Error(`${what}: no data returned`)
  return result.data
}

/** Ratings of the active set on one day. */
function ratingsOn(client: Client, day: string) {
  return client
    .from('rider_ratings')
    .select('athlete_id, attribute, value, rating, confidence, benchmark_sets!inner(is_active)')
    .eq('benchmark_sets.is_active', true)
    .eq('as_of', day)
}

export async function fetchModelOutputs(client: Client, asOf: string): Promise<ModelOutputs> {
  const [latestRating, latestCa] = await Promise.all([
    client
      .from('rider_ratings')
      .select('as_of, benchmark_sets!inner(is_active)')
      .eq('benchmark_sets.is_active', true)
      .lte('as_of', asOf)
      .order('as_of', { ascending: false })
      .limit(1),
    client
      .from('rider_ca_pa')
      .select('as_of')
      .lte('as_of', asOf)
      .order('as_of', { ascending: false })
      .limit(1),
  ])
  const ratingDay = check(latestRating, 'latest ratings')[0]?.as_of
  const caDay = check(latestCa, 'latest CA')[0]?.as_of

  const [current, before, ca] = await Promise.all([
    ratingDay ? ratingsOn(client, ratingDay) : null,
    ratingDay ? ratingsOn(client, daysBefore(ratingDay, CHANGE_DAYS)) : null,
    caDay
      ? client
          .from('rider_ca_pa')
          .select('athlete_id, ca, type_probs, pa_p10, pa_p50, pa_p90, ca_12m_p50, model_version')
          .eq('as_of', caDay)
      : null,
  ])

  const earlier = new Map(
    (before ? check(before, 'ratings 28 days ago') : []).map((row) => [
      `${row.athlete_id}/${row.attribute}`,
      row.rating,
    ]),
  )
  const ratings: ModelOutputs['ratings'] = new Map()
  for (const row of current ? check(current, 'ratings') : []) {
    const then = earlier.get(`${row.athlete_id}/${row.attribute}`)
    const own = ratings.get(row.athlete_id) ?? {}
    own[row.attribute] = {
      rating: row.rating,
      confidence: row.confidence,
      // Ratings show as whole numbers, so the arrow compares whole numbers.
      change28d: then === undefined ? null : Math.round(row.rating) - Math.round(then),
      value: row.value,
    }
    ratings.set(row.athlete_id, own)
  }

  const caPa: ModelOutputs['caPa'] = new Map()
  for (const row of ca ? check(ca, 'CA') : []) {
    caPa.set(row.athlete_id, {
      ca: row.ca,
      paP10: row.pa_p10,
      paP50: row.pa_p50,
      paP90: row.pa_p90,
      ca12mP50: row.ca_12m_p50,
      typeProbs: row.type_probs as CaPa['typeProbs'],
      modelVersion: row.model_version,
    })
  }
  return { ratings, caPa }
}
