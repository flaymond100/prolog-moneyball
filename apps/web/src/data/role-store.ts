import { useSyncExternalStore } from 'react'
import type { Enums } from '@prolog/types'

// Mock role until login (4.1): lets staff see what each role sees.
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
