import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@prolog/types'
import { fetchModelOutputs } from '@/data/real-ratings.ts'
import type {
  AttributeId,
  AttributeRating,
  LabTest,
  PowerCurve,
  PowerWindow,
  Rider,
} from '@/data/types.ts'

// Builds the riders the views show from the live database (TODO 4.3).
// What exists is shown: measured values, and the ratings, rider type and CA
// the nightly jobs wrote. What is not calculated yet (PA, durability,
// readiness, eFTP) is left empty for the views to mark.
// Columns are named explicitly: client roles have column grants (TODO 2.10).

type Client = SupabaseClient<Database>

const RIDES_WINDOW_DAYS = 84
// Effort durations of the power attributes (KB §6).
const POWER_SECS: Partial<Record<AttributeId, number>> = {
  p5s: 5,
  p30s: 30,
  p1m: 60,
  p5m: 300,
  p20m: 1200,
  p60m: 3600,
}
const ATTRIBUTE_IDS: AttributeId[] = [
  'p5s',
  'p30s',
  'p1m',
  'p5m',
  'p20m',
  'p60m',
  'durability',
  'vo2max',
]
const RACE_CATEGORIES = ['RACE_A', 'RACE_B', 'RACE_C']

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

/** The first row per key, from rows already ordered newest first. */
function firstBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T> {
  const out = new Map<K, T>()
  for (const row of rows) if (!out.has(key(row))) out.set(key(row), row)
  return out
}

export async function fetchRealSquad(client: Client, asOf: string): Promise<Rider[]> {
  const ridesFrom = daysBefore(asOf, RIDES_WINDOW_DAYS)
  const [athletes, profiles, wellness, curves, activities, races, labs, model] = await Promise.all([
    client.from('athletes').select('id, name').eq('active', true).order('name'),
    client
      .from('rider_profiles')
      .select(
        'athlete_id, date_of_birth, training_age_years, training_age_entered_on, background, primary_type_override, hrv_source, cohort, contract_end',
      ),
    // Latest training load per rider; viewers get no wellness rows (KB §11).
    client
      .from('wellness')
      .select('athlete_id, date, ctl, atl, ramp_rate')
      .gte('date', daysBefore(asOf, 14))
      .not('ctl', 'is', null)
      .order('date', { ascending: false }),
    client
      .from('power_curves')
      .select('athlete_id, as_of, time_window, secs, watts, wkg')
      .gte('as_of', daysBefore(asOf, 14))
      .order('as_of', { ascending: false }),
    client
      .from('activities')
      .select('athlete_id, type, trainer')
      .gte('start_date_local', ridesFrom),
    client
      .from('planned_events')
      .select('athlete_id, name, start_date_local, category')
      .in('category', RACE_CATEGORIES)
      .gte('start_date_local', asOf)
      .order('start_date_local'),
    // Lab tests are for coach, analyst and medical (KB §11); kg columns are not granted.
    client
      .from('lab_tests')
      .select(
        'athlete_id, test_date, method, vo2max_ml_kg_min, vo2max_l_min, vlamax_mmol_l_s, fatmax_w, fatmax_g_h, carbmax_g_h, at_w, height_cm, tester, notes',
      )
      .order('test_date'),
    fetchModelOutputs(client, asOf),
  ])

  const profileBy = firstBy(check(profiles, 'rider profiles'), (p) => p.athlete_id)
  const loadBy = firstBy(check(wellness, 'training load'), (w) => w.athlete_id)
  const curveBy = firstBy(check(curves, 'power curves'), (c) => `${c.athlete_id}/${c.time_window}`)
  const raceBy = firstBy(check(races, 'races'), (r) => r.athlete_id)
  const activityRows = check(activities, 'activities')
  const labRows = check(labs, 'lab tests')

  return check(athletes, 'athletes').map((athlete): Rider => {
    const profile = profileBy.get(athlete.id)
    const load = loadBy.get(athlete.id)
    const race = raceBy.get(athlete.id)
    const rides = activityRows.filter(
      (a) => a.athlete_id === athlete.id && a.type?.includes('Ride'),
    )
    const indoor = rides.filter((a) => a.trainer).length

    const powerCurves: PowerCurve[] = (['season', '84d', '42d'] as PowerWindow[]).flatMap(
      (window) => {
        const c = curveBy.get(`${athlete.id}/${window}`)
        return c ? [{ window, secs: c.secs, watts: c.watts, wkg: c.wkg }] : []
      },
    )
    const curve84 = curveBy.get(`${athlete.id}/84d`)

    const labTests: LabTest[] = labRows
      .filter((l) => l.athlete_id === athlete.id)
      .map((l) => ({
        date: l.test_date,
        method: l.method,
        vo2maxMlKgMin: l.vo2max_ml_kg_min,
        vlamaxMmolLS: l.vlamax_mmol_l_s,
        fatmaxW: l.fatmax_w,
        carbmaxGH: l.carbmax_g_h,
        atW: l.at_w,
        vo2maxLMin: l.vo2max_l_min,
        fatmaxGH: l.fatmax_g_h,
        heightCm: l.height_cm,
        tester: l.tester,
        notes: l.notes,
      }))

    // The rating with the value it was calculated from; otherwise the
    // measured value alone.
    const rated = model.ratings.get(athlete.id)
    const attributes = Object.fromEntries(
      ATTRIBUTE_IDS.map((id): [AttributeId, AttributeRating] => {
        const rating = rated?.[id]
        if (rating) return [id, rating]
        const secs = POWER_SECS[id]
        let value: number | null = null
        if (secs !== undefined && curve84) {
          const i = curve84.secs.indexOf(secs)
          value = i >= 0 ? (curve84.wkg?.[i] ?? null) : null
        }
        if (id === 'vo2max') value = labTests.at(-1)?.vo2maxMlKgMin ?? null
        return [id, { rating: null, confidence: 'high', change28d: null, value }]
      }),
    ) as Record<AttributeId, AttributeRating>

    return {
      id: athlete.id,
      name: athlete.name,
      dateOfBirth: profile?.date_of_birth ?? null,
      trainingAgeYears: profile?.training_age_years ?? null,
      trainingAgeEnteredOn: profile?.training_age_entered_on ?? null,
      background: profile?.background ?? null,
      primaryTypeOverride: profile?.primary_type_override ?? null,
      cohort: profile?.cohort ?? 'squad',
      hrvSource: profile?.hrv_source ?? null,
      contractEnd: profile?.contract_end ?? null,
      asOf,
      attributes,
      caPa: model.caPa.get(athlete.id) ?? null,
      powerCurves,
      durability: [],
      labTests,
      training: {
        ctl: load?.ctl ?? null,
        atl: load?.atl ?? null,
        tsb: load?.ctl != null && load.atl != null ? load.ctl - load.atl : null,
        rampRate: load?.ramp_rate ?? null,
        compliance12wPct: null,
        indoorPct: rides.length > 0 ? (indoor / rides.length) * 100 : null,
        rides84d: rides.length,
      },
      // Wellness beyond training load is not collected until legal sign-off (KB §11).
      readiness: {
        light: 'grey',
        reasons: ['Wellness is not collected yet'],
        lnRmssdZ: null,
        restingHrDeltaBpm: null,
        sleepHours: null,
      },
      form: {
        lnRmssd7d: [],
        baselineMean: null,
        baselineSd: null,
        hrvReadings7d: 0,
        eftpWkg: [],
        nextRace: race
          ? {
              name: race.name ?? 'Race',
              date: race.start_date_local.slice(0, 10),
              projectedTsb: null,
            }
          : null,
      },
      notes: [],
    }
  })
}
