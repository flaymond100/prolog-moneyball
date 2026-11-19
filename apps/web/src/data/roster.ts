import { queryOptions, useQuery } from '@tanstack/react-query'
import { ratingFromBenchmark, type Benchmark } from '@prolog/metrics'
import type { Enums } from '@prolog/types'
import { supabase } from '@/lib/supabase.ts'

// Roster: the signed riders of a season with the numbers they reported, read
// from v_roster (kg for coach and medical, call notes for the coach; null
// otherwise). The reported 1, 5 and 20 min W/kg are rated against the active
// benchmark set with the same function the nightly rating job uses.
// No mock roster: real riders never go into the public repo.

export const ROSTER_SEASON = 2027

export type RosterTier = Enums<'roster_tier'>
export type RosterDataQuality = Enums<'roster_data_quality'>

export const TIER_LABELS: Record<RosterTier, string> = {
  ambassador: 'Ambassador',
  core: 'Core',
  development: 'Development',
}

export const DATA_QUALITY_LABELS: Record<RosterDataQuality, string> = {
  modelled: 'Modelled',
  sub_maximal: 'Sub-Maximal',
  garmin_estimate: 'Garmin Estimate',
}

/** The roster's reported durations and the benchmark attribute each is rated on. */
export const ROSTER_EFFORTS = [
  { id: 'p20m', label: "20'" },
  { id: 'p5m', label: "5'" },
  { id: 'p1m', label: "1'" },
] as const

export type RosterEffortId = (typeof ROSTER_EFFORTS)[number]['id']

export interface RosterEffort {
  watts: number | null
  wkg: number | null
  /** 1–20 against the active benchmark set; null without W/kg or a benchmark. */
  rating: number | null
}

export interface RosterEntry {
  id: string
  name: string
  tier: RosterTier
  base: string | null
  /** Null for roles that may not see kg (KB §11). */
  weightKg: number | null
  efforts: Record<RosterEffortId, RosterEffort>
  dataQuality: RosterDataQuality | null
  raceScore: number | null
  teamScore: number | null
  totalScore: number | null
  scoutingNotes: string | null
  /** Coach only. */
  staffNotes: string | null
}

interface BenchmarkPointRow {
  attribute: string
  method: string
  mean: number | null
  sd: number | null
  anchor_values: number[] | null
  anchor_ratings: number[] | null
}

function toBenchmark(row: BenchmarkPointRow): Benchmark | null {
  if (row.method === 'z_score' && row.mean !== null && row.sd !== null) {
    return { method: 'z_score', mean: row.mean, sd: row.sd }
  }
  if (row.method === 'anchors' && row.anchor_values && row.anchor_ratings) {
    return { method: 'anchors', anchorValues: row.anchor_values, anchorRatings: row.anchor_ratings }
  }
  return null
}

async function fetchRoster(): Promise<RosterEntry[]> {
  if (!supabase) throw new Error('This build is not connected to Supabase.')
  const [roster, points] = await Promise.all([
    supabase
      .from('v_roster')
      .select(
        'id, rider_name, tier, base, weight_kg, p20m_w, p20m_wkg, p5m_w, p5m_wkg, p1m_w, p1m_wkg, data_quality, race_score, team_score, total_score, scouting_notes, staff_notes',
      )
      .eq('season', ROSTER_SEASON)
      .order('rider_name'),
    supabase
      .from('benchmark_points')
      .select(
        'attribute, method, mean, sd, anchor_values, anchor_ratings, benchmark_sets!inner(is_active)',
      )
      .eq('benchmark_sets.is_active', true),
  ])
  if (roster.error) throw new Error(roster.error.message)
  if (points.error) throw new Error(points.error.message)

  const benchmarks = new Map<string, Benchmark>()
  for (const row of points.data) {
    const benchmark = toBenchmark(row)
    if (benchmark) benchmarks.set(row.attribute, benchmark)
  }

  function effort(id: RosterEffortId, watts: number | null, wkg: number | null): RosterEffort {
    const benchmark = benchmarks.get(id)
    return {
      watts,
      wkg,
      rating: wkg !== null && benchmark ? ratingFromBenchmark(wkg, benchmark) : null,
    }
  }

  return roster.data.flatMap((r) =>
    r.id && r.rider_name && r.tier
      ? [
          {
            id: r.id,
            name: r.rider_name,
            tier: r.tier,
            base: r.base,
            weightKg: r.weight_kg,
            efforts: {
              p20m: effort('p20m', r.p20m_w, r.p20m_wkg),
              p5m: effort('p5m', r.p5m_w, r.p5m_wkg),
              p1m: effort('p1m', r.p1m_w, r.p1m_wkg),
            },
            dataQuality: r.data_quality,
            raceScore: r.race_score,
            teamScore: r.team_score,
            totalScore: r.total_score,
            scoutingNotes: r.scouting_notes,
            staffNotes: r.staff_notes,
          },
        ]
      : [],
  )
}

export const rosterQuery = queryOptions({
  queryKey: ['roster', ROSTER_SEASON],
  queryFn: fetchRoster,
})

export function useRoster() {
  return useQuery({ ...rosterQuery, enabled: supabase !== null })
}
