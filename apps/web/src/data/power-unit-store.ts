import { useSyncExternalStore } from 'react'

// Power unit for Squad and Compare: W/kg or absolute watts. A viewing
// preference, kept in this browser. Ratings always use W/kg (KB §6).

export type PowerUnit = 'wkg' | 'w'

const KEY = 'prolog.power-unit.v1'

function read(): PowerUnit {
  try {
    return localStorage.getItem(KEY) === 'w' ? 'w' : 'wkg'
  } catch {
    return 'wkg'
  }
}

let state: PowerUnit = read()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePowerUnit(): PowerUnit {
  return useSyncExternalStore(subscribe, () => state)
}

export function setPowerUnit(unit: PowerUnit) {
  state = unit
  try {
    localStorage.setItem(KEY, unit)
  } catch {
    // Storage blocked: keep the unit for this session only.
  }
  for (const l of listeners) l()
}
