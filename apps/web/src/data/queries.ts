import { queryOptions, useQuery } from '@tanstack/react-query'
import { MOCK_RIDERS } from '@/data/mock/riders.ts'
import type { Rider } from '@/data/types.ts'

// The one place views get rider data from. Mock fixtures for now; swap the
// query functions for Supabase reads without touching the views.

async function fetchSquad(): Promise<Rider[]> {
  return Promise.resolve(MOCK_RIDERS)
}

async function fetchRider(id: string): Promise<Rider | null> {
  return Promise.resolve(MOCK_RIDERS.find((r) => r.id === id) ?? null)
}

export const squadQuery = queryOptions({ queryKey: ['squad'], queryFn: fetchSquad })

export function riderQuery(id: string) {
  return queryOptions({ queryKey: ['rider', id], queryFn: () => fetchRider(id) })
}

export function useSquad() {
  return useQuery(squadQuery)
}

export function useRider(id: string) {
  return useQuery(riderQuery(id))
}
