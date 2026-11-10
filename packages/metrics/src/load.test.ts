import { describe, expect, it } from 'vitest'
import { projectLoad } from './load.ts'

describe('projectLoad', () => {
  // intervals.icu wellness for two athletes (November 2026): the start day's
  // ctl/atl, the following days' ctlLoad, and the ctl/atl it reported after.
  it('reproduces intervals.icu CTL and ATL', () => {
    const rest = projectLoad({ ctl: 61.90096, atl: 42.99296 }, [0, 30])
    expect(rest[1]?.ctl).toBeCloseTo(59.728226, 4)
    expect(rest[1]?.atl).toBeCloseTo(36.3019, 4)

    const [hard] = projectLoad({ ctl: 32.697678, atl: 53.617184 }, [197])
    expect(hard?.ctl).toBeCloseTo(36.563435, 4)
    expect(hard?.atl).toBeCloseTo(72.704605, 4)
  })

  it('reports TSB as CTL − ATL each day', () => {
    for (const day of projectLoad({ ctl: 60, atl: 70 }, [100, 0, 50])) {
      expect(day.tsb).toBeCloseTo(day.ctl - day.atl, 10)
    }
  })

  it('stays put when the load equals CTL and ATL', () => {
    expect(projectLoad({ ctl: 50, atl: 50 }, [50, 50])).toEqual([
      { ctl: 50, atl: 50, tsb: 0 },
      { ctl: 50, atl: 50, tsb: 0 },
    ])
  })

  it('returns nothing for no days', () => {
    expect(projectLoad({ ctl: 50, atl: 40 }, [])).toEqual([])
  })

  it('takes other time constants', () => {
    const [day] = projectLoad({ ctl: 0, atl: 0 }, [100], { ctlDays: 1, atlDays: 1 })
    expect(day?.ctl).toBeCloseTo(100 * (1 - Math.exp(-1)), 10)
    expect(day?.atl).toBeCloseTo(100 * (1 - Math.exp(-1)), 10)
  })

  it('rejects time constants that are not positive', () => {
    expect(() => projectLoad({ ctl: 0, atl: 0 }, [], { ctlDays: 0 })).toThrow(RangeError)
    expect(() => projectLoad({ ctl: 0, atl: 0 }, [], { atlDays: -7 })).toThrow(RangeError)
  })
})
