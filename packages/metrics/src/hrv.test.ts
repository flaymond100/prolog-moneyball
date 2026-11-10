import { describe, expect, it } from 'vitest'
import { lnRmssdStats, type HrvReading } from './hrv.ts'

const AS_OF = '2026-11-10'
/** A reading whose ln rMSSD is `ln`. */
const at = (date: string, ln: number): HrvReading => ({ date, rmssd: Math.exp(ln) })

describe('lnRmssdStats', () => {
  it('summarises the last 7 days against the 60-day baseline', () => {
    const stats = lnRmssdStats(
      [
        at('2026-11-10', 4.0),
        at('2026-11-08', 4.2),
        at('2026-11-05', 4.4),
        at('2026-10-01', 4.5),
        at('2026-09-20', 4.5),
      ],
      AS_OF,
    )
    expect(stats.readings7d).toBe(3)
    expect(stats.mean7d).toBeCloseTo(4.2, 10)
    expect(stats.cv7dPct).toBeCloseTo((0.2 / 4.2) * 100, 10) // sample SD 0.2
    expect(stats.baselineMean60d).toBeCloseTo(4.32, 10)
    expect(stats.baselineSd60d).toBeCloseTo(Math.sqrt(0.188 / 4), 10)
    expect(stats.z7d).toBeCloseTo((4.2 - 4.32) / Math.sqrt(0.188 / 4), 10)
  })

  it('includes the as-of day and 6 days before in the window, 59 days before in the baseline', () => {
    const stats = lnRmssdStats(
      [
        at('2026-11-04', 4), // 6 days before: window
        at('2026-11-03', 4), // 7 days before: baseline only
        at('2026-09-12', 4), // 59 days before: baseline
        at('2026-09-11', 4), // 60 days before: outside
        at('2026-11-11', 4), // after the as-of date: ignored
      ],
      AS_OF,
    )
    expect(stats.readings7d).toBe(1)
    expect(stats.baselineMean60d).toBe(4)
    expect(stats.baselineSd60d).toBe(0)
  })

  it('skips missing and non-positive readings', () => {
    const stats = lnRmssdStats(
      [{ date: AS_OF, rmssd: null }, { date: AS_OF, rmssd: 0 }, at('2026-11-09', 4.1)],
      AS_OF,
    )
    expect(stats.readings7d).toBe(1)
    expect(stats.mean7d).toBeCloseTo(4.1, 10)
  })

  it('is empty without readings', () => {
    expect(lnRmssdStats([], AS_OF)).toEqual({
      readings7d: 0,
      mean7d: null,
      cv7dPct: null,
      baselineMean60d: null,
      baselineSd60d: null,
      z7d: null,
    })
  })

  it('has no spread or z-score from a single reading', () => {
    const stats = lnRmssdStats([at(AS_OF, 4.3)], AS_OF)
    expect(stats.mean7d).toBeCloseTo(4.3, 10)
    expect(stats.cv7dPct).toBeNull()
    expect(stats.baselineSd60d).toBeNull()
    expect(stats.z7d).toBeNull()
  })

  it('has no z-score without recent readings or without a spread in the baseline', () => {
    const old = lnRmssdStats([at('2026-10-20', 4.1), at('2026-10-21', 4.3)], AS_OF)
    expect(old.mean7d).toBeNull()
    expect(old.baselineMean60d).toBeCloseTo(4.2, 10)
    expect(old.z7d).toBeNull()

    const flat = lnRmssdStats([at(AS_OF, 4.2), at('2026-11-09', 4.2)], AS_OF)
    expect(flat.baselineSd60d).toBe(0)
    expect(flat.z7d).toBeNull()
  })
})
