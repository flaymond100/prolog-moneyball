import { useSyncExternalStore } from 'react'
import { metricDef } from '@/data/metric-registry.ts'
import type { Rider } from '@/data/types.ts'

// The active filter is shared by the squad table and the scatter explorer for
// the session. Saved filters belong in `saved_filters` per staff user (KB §5);
// until login exists they live in this browser only.

export const OPERATORS = ['≥', '≤', '>', '<', '='] as const
export type Operator = (typeof OPERATORS)[number]

export interface Condition {
  metric: string
  op: Operator
  value: number
}

export interface SavedFilter {
  name: string
  conditions: Condition[]
}

interface State {
  conditions: Condition[]
  saved: SavedFilter[]
}

const KEY = 'prolog.saved-filters.v1'

function readSaved(): SavedFilter[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SavedFilter[]) : []
  } catch {
    return []
  }
}

let state: State = { conditions: [], saved: readSaved() }
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  for (const l of listeners) l()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useFilterState(): State {
  return useSyncExternalStore(subscribe, () => state)
}

export const filterActions = {
  add(condition: Condition) {
    set({ ...state, conditions: [...state.conditions, condition] })
  },
  remove(index: number) {
    set({ ...state, conditions: state.conditions.filter((_, i) => i !== index) })
  },
  clear() {
    set({ ...state, conditions: [] })
  },
  load(name: string) {
    const found = state.saved.find((f) => f.name === name)
    if (found) set({ ...state, conditions: found.conditions })
  },
  save(name: string) {
    const saved = [
      ...state.saved.filter((f) => f.name !== name),
      { name, conditions: state.conditions },
    ]
    try {
      localStorage.setItem(KEY, JSON.stringify(saved))
    } catch {
      // Storage blocked: the filter lasts for this session only.
    }
    set({ ...state, saved })
  },
}

function test(value: number, op: Operator, target: number): boolean {
  switch (op) {
    case '≥':
      return value >= target
    case '≤':
      return value <= target
    case '>':
      return value > target
    case '<':
      return value < target
    case '=':
      return value === target
  }
}

/** True when the rider meets every condition (AND). Missing values never match. */
export function matchesAll(rider: Rider, conditions: readonly Condition[]): boolean {
  return conditions.every((c) => {
    const value = metricDef(c.metric)?.get(rider)
    return value !== undefined && value !== null && test(value, c.op, c.value)
  })
}
