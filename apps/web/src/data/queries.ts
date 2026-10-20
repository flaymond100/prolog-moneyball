import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MOCK_RIDERS } from '@/data/mock/riders.ts'
import type { Anthropometric, LabTest, Rider } from '@/data/types.ts'

// The one place views get rider data from. Mock fixtures for now, kept in
// memory so entries made in the Tests view last for the session; swap these
// functions for Supabase reads and writes without touching the views.

let riders: Rider[] = structuredClone(MOCK_RIDERS)
let anthropometrics: Anthropometric[] = []

async function fetchSquad(): Promise<Rider[]> {
  return Promise.resolve(riders)
}

async function fetchRider(id: string): Promise<Rider | null> {
  return Promise.resolve(riders.find((r) => r.id === id) ?? null)
}

async function fetchAnthropometrics(): Promise<Anthropometric[]> {
  return Promise.resolve(anthropometrics)
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

/** Mirrors the unique constraint lab_tests_one_per_athlete_date_method. */
async function insertLabTest({ athleteId, test }: { athleteId: string; test: LabTest }) {
  const rider = riders.find((r) => r.id === athleteId)
  if (!rider) throw new Error('Unknown rider.')
  if (rider.labTests.some((t) => t.date === test.date && t.method === test.method)) {
    throw new Error('This rider already has a test with this date and method.')
  }
  const labTests = [...rider.labTests, test].sort((a, b) => a.date.localeCompare(b.date))
  riders = riders.map((r) => (r.id === athleteId ? { ...r, labTests } : r))
  return Promise.resolve()
}

/** Mirrors the primary key (athlete_id, date). */
async function insertAnthropometric(entry: Anthropometric) {
  if (anthropometrics.some((a) => a.athleteId === entry.athleteId && a.date === entry.date)) {
    throw new Error('This rider already has measurements on this date.')
  }
  anthropometrics = [...anthropometrics, entry].sort((a, b) => b.date.localeCompare(a.date))
  return Promise.resolve()
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
  riders = riders.map((r) => (r.id === id ? { ...r, ...patch } : r))
  return Promise.resolve()
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
