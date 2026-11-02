import { useSyncExternalStore } from 'react'
import type { Enums } from '@prolog/types'

// The signed-in staff member's role, set by the auth provider from `staff`.
// A dev build on mock data starts as coach and lets the header switch roles.
export type StaffRole = Enums<'staff_role'>

export const ROLE_LABELS: Record<StaffRole, string> = {
  coach: 'Coach',
  analyst: 'Analyst',
  medical: 'Medical',
  viewer: 'Viewer',
}

let role: StaffRole = 'coach'
const listeners = new Set<() => void>()

export function useRole(): StaffRole {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => role,
  )
}

export function setRole(next: StaffRole) {
  role = next
  for (const l of listeners) l()
}
