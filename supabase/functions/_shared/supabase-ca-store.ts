// CaStore on Supabase, used by compute-ca with the service role key (which
// bypasses RLS and may call body_mass_as_of).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CaWeight, RiderType } from '@prolog/metrics'
import { z } from 'zod'
import type { CaRider, CaRow, CaStore, PriorRow, RatedAttribute } from './ca.ts'

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

// An rpc result is untyped, so its rows are checked here.
const bodyMassSchema = z.array(z.object({ athlete_id: z.string(), weight_kg: z.number() }))

export class SupabaseCaStore implements CaStore {
  private readonly db: SupabaseClient

  constructor(db: SupabaseClient) {
    this.db = db
  }

  async activeSetId(): Promise<string | null> {
    const sets = rows(
      await this.db
        .from('benchmark_sets')
        .select('id')
        .eq('is_active', true)
        .overrideTypes<{ id: string }[], { merge: false }>(),
      'read active benchmark set',
    )
    return sets[0]?.id ?? null
  }

  async riders(): Promise<CaRider[]> {
    interface Profile {
      athlete_id: string
      cohort: string
      primary_type_override: RiderType | null
    }
    const [athletes, profiles] = await Promise.all([
      this.db
        .from('athletes')
        .select('id')
        .eq('active', true)
        .overrideTypes<{ id: string }[], { merge: false }>(),
      this.db
        .from('rider_profiles')
        .select('athlete_id, cohort, primary_type_override')
        .overrideTypes<Profile[], { merge: false }>(),
    ])
    const byAthlete = new Map(
      rows(profiles, 'read rider profiles').map((profile) => [profile.athlete_id, profile]),
    )
    // A rider without a profile yet counts as squad, the cohort default.
    return rows(athletes, 'read athletes').map((athlete) => {
      const profile = byAthlete.get(athlete.id)
      return {
        athlete_id: athlete.id,
        in_squad: (profile?.cohort ?? 'squad') === 'squad',
        type_override: profile?.primary_type_override ?? null,
      }
    })
  }

  async ratings(asOf: string, setId: string): Promise<RatedAttribute[]> {
    return rows(
      await this.db
        .from('rider_ratings')
        .select('athlete_id, attribute, rating, confidence, watts, watts_squad_rating')
        .eq('as_of', asOf)
        .eq('set_id', setId)
        .overrideTypes<RatedAttribute[], { merge: false }>(),
      'read rider ratings',
    )
  }

  async caWeights(): Promise<CaWeight[]> {
    interface WeightRow {
      rider_type: RiderType
      attribute: string
      weight: number
      absolute_watts: boolean
    }
    const weights = rows(
      await this.db
        .from('ca_weights')
        .select('rider_type, attribute, weight, absolute_watts')
        .overrideTypes<WeightRow[], { merge: false }>(),
      'read CA weights',
    )
    return weights.map((row) => ({
      riderType: row.rider_type,
      attribute: row.attribute,
      weight: row.weight,
      absoluteWatts: row.absolute_watts,
    }))
  }

  async riderTypePriors(): Promise<PriorRow[]> {
    return rows(
      await this.db
        .from('model_priors')
        .select('key, value')
        .eq('model', 'rider_type')
        .overrideTypes<PriorRow[], { merge: false }>(),
      'read rider type priors',
    )
  }

  async latestVlamax(asOf: string): Promise<Map<string, number>> {
    const tests = rows(
      await this.db
        .from('lab_tests')
        .select('athlete_id, vlamax_mmol_l_s')
        .not('vlamax_mmol_l_s', 'is', null)
        .lte('test_date', asOf)
        // Newest first; on one day a lab test comes before a modelled field test.
        .order('test_date', { ascending: false })
        .order('method', { ascending: true })
        .overrideTypes<{ athlete_id: string; vlamax_mmol_l_s: number }[], { merge: false }>(),
      'read lab tests',
    )
    const latest = new Map<string, number>()
    for (const test of tests) {
      if (!latest.has(test.athlete_id)) latest.set(test.athlete_id, test.vlamax_mmol_l_s)
    }
    return latest
  }

  async bodyMass(asOf: string): Promise<Map<string, number>> {
    const result = await this.db.rpc('body_mass_as_of', { p_as_of: asOf })
    if (result.error) throw new Error(`read body mass: ${result.error.message}`)
    return new Map(bodyMassSchema.parse(result.data).map((row) => [row.athlete_id, row.weight_kg]))
  }

  async replaceCa(asOf: string, computedAt: string, ca: CaRow[]): Promise<number> {
    if (ca.length > 0) {
      const written = await this.db
        .from('rider_ca_pa')
        .upsert(ca, { onConflict: 'athlete_id,as_of' })
      if (written.error) throw new Error(`upsert rider CA: ${written.error.message}`)
    }
    const stale = rows(
      await this.db
        .from('rider_ca_pa')
        .delete()
        .eq('as_of', asOf)
        .lt('computed_at', computedAt)
        .select('athlete_id'),
      'delete stale rider CA',
    )
    return stale.length
  }
}
