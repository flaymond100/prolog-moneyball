// Training load (KB §9): CTL and ATL as exponentially weighted averages of
// daily load, TSB = CTL − ATL. The update matches intervals.icu, whose
// wellness `ctl`/`atl` follow x + (load − x) · (1 − e^(−1/τ)) to within 1e-5
// (checked on 100 days of three athletes, 10 November 2026), so a projection
// continues the synced values without a jump.

export const CTL_DAYS = 42
export const ATL_DAYS = 7

export interface LoadState {
  ctl: number
  atl: number
}

export interface LoadDay extends LoadState {
  tsb: number
}

function step(value: number, load: number, days: number): number {
  return value + (load - value) * (1 - Math.exp(-1 / days))
}

/**
 * CTL, ATL and TSB for each day after `start`, given that day's load
 * (`loads[0]` is tomorrow). Rest days are a load of 0.
 */
export function projectLoad(
  start: LoadState,
  loads: readonly number[],
  { ctlDays = CTL_DAYS, atlDays = ATL_DAYS }: { ctlDays?: number; atlDays?: number } = {},
): LoadDay[] {
  if (!(ctlDays > 0) || !(atlDays > 0)) {
    throw new RangeError('CTL and ATL time constants must be positive')
  }
  let { ctl, atl } = start
  return loads.map((load) => {
    ctl = step(ctl, load, ctlDays)
    atl = step(atl, load, atlDays)
    return { ctl, atl, tsb: ctl - atl }
  })
}
