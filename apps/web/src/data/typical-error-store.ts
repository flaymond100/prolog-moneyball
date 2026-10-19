import { useSyncExternalStore } from 'react'

// Typical error per lab metric, entered by the coach in Settings (KB §10).
// There are no defaults: a change is only judged once the coach has set one.
// Kept in this browser until a settings table exists.

const KEY = 'prolog.typical-error.v1'

type TypicalErrors = Partial<Record<string, number>>

function read(): TypicalErrors {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as TypicalErrors) : {}
  } catch {
    return {}
  }
}

let state: TypicalErrors = read()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTypicalErrors(): TypicalErrors {
  return useSyncExternalStore(subscribe, () => state)
}

export function setTypicalError(metric: string, value: number | null) {
  const next: TypicalErrors = Object.fromEntries(
    Object.entries(state).filter(([key]) => key !== metric),
  )
  if (value !== null) next[metric] = value
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage blocked: keep the value for this session only.
  }
  for (const l of listeners) l()
}
