import { useSyncExternalStore } from 'react'

// Rating mode (KB §6): ratings against the active benchmark set, or
// squad-relative, where each rider's squad percentile maps linearly to 1–20.
// A viewing preference, kept in this browser; CA and PA always use the
// benchmark set.

export type RatingMode = 'benchmark' | 'squad'

const KEY = 'prolog.rating-mode.v1'

function read(): RatingMode {
  try {
    return localStorage.getItem(KEY) === 'squad' ? 'squad' : 'benchmark'
  } catch {
    return 'benchmark'
  }
}

let state: RatingMode = read()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useRatingMode(): RatingMode {
  return useSyncExternalStore(subscribe, () => state)
}

export function setRatingMode(mode: RatingMode) {
  state = mode
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    // Storage blocked: keep the mode for this session only.
  }
  for (const l of listeners) l()
}
