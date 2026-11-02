import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MOCK_RIDERS } from '@/data/mock/riders.ts'
import { MOCK_SYNC_HEALTH } from '@/data/mock/sync-health.ts'
import { fetchRealSquad } from '@/data/real-riders.ts'
import type { Anthropometric, LabTest, Rider, SyncHealth, SyncOutcome } from '@/data/types.ts'
import { supabase } from '@/lib/supabase.ts'

// The one place views get rider data from (TODO 4.3). With Supabase settings
// the views read and write the live database; without them (a dev build or a
// unit test) they use the mock riders, kept in memory for the session.

let mockRiders: Rider[] = structuredClone(MOCK_RIDERS)
let mockAnthropometrics: Anthropometric[] = []

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Postgres errors in words a coach can act on; check messages are already readable. */
function writeError(error: { code?: string; message: string }, duplicate: string): Error {
  if (error.code === '23505') return new Error(duplicate)
  if (error.code === '42501') return new Error('Only the coach can enter or change this.')
  return new Error(error.message)
}

async function fetchSquad(): Promise<Rider[]> {
  return supabase ? fetchRealSquad(supabase, today()) : mockRiders
}

async function fetchRider(id: string): Promise<Rider | null> {
  return (await fetchSquad()).find((r) => r.id === id) ?? null
}

async function fetchAnthropometrics(): Promise<Anthropometric[]> {
  if (!supabase) return mockAnthropometrics
  // Coach and medical only (KB §11); other roles get no rows.
  const { data, error } = await supabase
    .from('anthropometrics')
    .select('athlete_id, date, height_cm, weight_kg, body_fat_pct, notes')
    .order('date', { ascending: false })
  if (error) throw new Error(error.message)
  return data.map((a) => ({
    athleteId: a.athlete_id,
    date: a.date,
    heightCm: a.height_cm,
    weightKg: a.weight_kg,
    bodyFatPct: a.body_fat_pct,
    notes: a.notes,
  }))
}

export const squadQuery = queryOptions({ queryKey: ['squad'], queryFn: fetchSquad })

export function riderQuery(id: string) {
  return queryOptions({ queryKey: ['rider', id], queryFn: () => fetchRider(id) })
}

export const anthropometricsQuery = queryOptions({
  queryKey: ['anthropometrics'],
  queryFn: fetchAnthropometrics,
})

export function useSquad() {
  return useQuery(squadQuery)
}

export function useRider(id: string) {
  return useQuery(riderQuery(id))
}

export function useAnthropometrics() {
  return useQuery(anthropometricsQuery)
}

/** v_sync_last_run and v_sync_health (TODO 3.7). */
async function fetchSyncHealth(): Promise<SyncHealth> {
  if (!supabase) return MOCK_SYNC_HEALTH
  const [last, riders] = await Promise.all([
    supabase
      .from('v_sync_last_run')
      .select('id, outcome, started_at, finished_at, api_calls, error_count, errors'),
    supabase.from('v_sync_health').select('athlete_id, name, last_success_at, stale').order('name'),
  ])
  if (last.error) throw new Error(last.error.message)
  if (riders.error) throw new Error(riders.error.message)
  const run = last.data[0]
  const errors = (Array.isArray(run?.errors) ? run.errors : []) as {
    athlete_id: string | null
    step: string
    message: string
  }[]
  return {
    lastRun:
      run?.id != null && run.started_at
        ? {
            id: run.id,
            outcome: run.outcome as SyncOutcome,
            startedAt: run.started_at,
            finishedAt: run.finished_at,
            apiCalls: run.api_calls,
            errorCount: run.error_count ?? 0,
            errors: errors.map((e) => ({
              athleteId: e.athlete_id,
              step: e.step,
              message: e.message,
            })),
          }
        : null,
    riders: riders.data.map((r) => ({
      athleteId: r.athlete_id ?? '',
      name: r.name ?? '',
      lastSuccessAt: r.last_success_at,
      stale: r.stale ?? true,
    })),
  }
}

export const syncHealthQuery = queryOptions({ queryKey: ['sync-health'], queryFn: fetchSyncHealth })

export function useSyncHealth() {
  return useQuery(syncHealthQuery)
}

const DUPLICATE_LAB_TEST = 'This rider already has a test with this date and method.'
const DUPLICATE_MEASUREMENT = 'This rider already has measurements on this date.'

async function insertLabTest({ athleteId, test }: { athleteId: string; test: LabTest }) {
  if (supabase) {
    // No `.select()`: weight and body fat are not readable by client roles (TODO 2.10).
    const { error } = await supabase.from('lab_tests').insert({
      athlete_id: athleteId,
      test_date: test.date,
      method: test.method,
      vo2max_ml_kg_min: test.vo2maxMlKgMin,
      vo2max_l_min: test.vo2maxLMin ?? null,
      vlamax_mmol_l_s: test.vlamaxMmolLS,
      fatmax_w: test.fatmaxW,
      fatmax_g_h: test.fatmaxGH ?? null,
      carbmax_g_h: test.carbmaxGH,
      at_w: test.atW,
      weight_kg: test.weightKg ?? null,
      height_cm: test.heightCm ?? null,
      body_fat_pct: test.bodyFatPct ?? null,
      tester: test.tester ?? null,
      notes: test.notes ?? null,
    })
    if (error) throw writeError(error, DUPLICATE_LAB_TEST)
    return
  }
  // Mock: mirrors the unique constraint lab_tests_one_per_athlete_date_method.
  const rider = mockRiders.find((r) => r.id === athleteId)
  if (!rider) throw new Error('Unknown rider.')
  if (rider.labTests.some((t) => t.date === test.date && t.method === test.method)) {
    throw new Error(DUPLICATE_LAB_TEST)
  }
  const labTests = [...rider.labTests, test].sort((a, b) => a.date.localeCompare(b.date))
  mockRiders = mockRiders.map((r) => (r.id === athleteId ? { ...r, labTests } : r))
}

async function insertAnthropometric(entry: Anthropometric) {
  if (supabase) {
    const { error } = await supabase.from('anthropometrics').insert({
      athlete_id: entry.athleteId,
      date: entry.date,
      height_cm: entry.heightCm,
      weight_kg: entry.weightKg,
      body_fat_pct: entry.bodyFatPct,
      notes: entry.notes,
    })
    if (error) throw writeError(error, DUPLICATE_MEASUREMENT)
    return
  }
  // Mock: mirrors the primary key (athlete_id, date).
  if (mockAnthropometrics.some((a) => a.athleteId === entry.athleteId && a.date === entry.date)) {
    throw new Error(DUPLICATE_MEASUREMENT)
  }
  mockAnthropometrics = [...mockAnthropometrics, entry].sort((a, b) => b.date.localeCompare(a.date))
}

export type RiderProfilePatch = Partial<
  Pick<
    Rider,
    | 'dateOfBirth'
    | 'trainingAgeYears'
    | 'trainingAgeEnteredOn'
    | 'background'
    | 'primaryTypeOverride'
    | 'hrvSource'
    | 'cohort'
    | 'contractEnd'
  >
>

async function updateRiderProfile({ id, patch }: { id: string; patch: RiderProfilePatch }) {
  if (supabase) {
    // Only the fields in the patch; the row is created on first save.
    const { error } = await supabase.from('rider_profiles').upsert(
      {
        athlete_id: id,
        ...('dateOfBirth' in patch && { date_of_birth: patch.dateOfBirth }),
        ...('trainingAgeYears' in patch && { training_age_years: patch.trainingAgeYears }),
        ...('trainingAgeEnteredOn' in patch && {
          training_age_entered_on: patch.trainingAgeEnteredOn,
        }),
        ...('background' in patch && { background: patch.background }),
        ...('primaryTypeOverride' in patch && { primary_type_override: patch.primaryTypeOverride }),
        ...('hrvSource' in patch && { hrv_source: patch.hrvSource }),
        ...('cohort' in patch && { cohort: patch.cohort }),
        ...('contractEnd' in patch && { contract_end: patch.contractEnd }),
      },
      { onConflict: 'athlete_id' },
    )
    if (error) throw writeError(error, 'This profile already exists.')
    return
  }
  mockRiders = mockRiders.map((r) => (r.id === id ? { ...r, ...patch } : r))
}

export function useUpdateRiderProfile() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: updateRiderProfile,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['squad'] })
      await client.invalidateQueries({ queryKey: ['rider'] })
    },
  })
}

export function useAddLabTest() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: insertLabTest,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['squad'] })
      await client.invalidateQueries({ queryKey: ['rider'] })
    },
  })
}

export function useAddAnthropometric() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: insertAnthropometric,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['anthropometrics'] })
    },
  })
}
