import type { SortingState, VisibilityState } from '@tanstack/react-table'

// Saved squad-table layouts. KB §5 keeps these in `saved_layouts` per staff
// user; until login exists they live in this browser only.

export interface SquadLayout {
  name: string
  group: string
  hidden: VisibilityState
  sorting: SortingState
  minRides: number
}

const KEY = 'prolog.squad-layouts.v1'

export function loadLayouts(): SquadLayout[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SquadLayout[]) : []
  } catch {
    return []
  }
}

export function storeLayouts(layouts: SquadLayout[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(layouts))
  } catch {
    // Private mode or blocked storage: layouts last for this session only.
  }
}
