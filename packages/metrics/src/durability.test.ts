import { describe, expect, it } from 'vitest'
import { bestPowerAfterWork, retainedPct } from './durability.ts'

describe('retainedPct', () => {
  it('divides post-fatigue by fresh power', () => {
    expect(retainedPct(5.75, 5.35)).toBeCloseTo(93.04, 2)
  })

  it('is null without fresh power', () => {
    expect(retainedPct(0, 4)).toBeNull()
  })
})

describe('bestPowerAfterWork', () => {
  /** `seconds` samples at `watts`, one per second. */
  const block = (seconds: number, watts: number | null) =>
    Array.from({ length: seconds }, () => watts)

  // A 60 kg rider: 1 kJ/kg is 60,000 J, i.e. 300 s at 200 W.
  const MASS = 60

  it('finds the best effort that starts after the work is done', () => {
    // 600 s at 200 W = 2 kJ/kg, then 60 s at 400 W, 300 s at 100 W and 60 s at 300 W.
    const ride = [...block(600, 200), ...block(60, 400), ...block(300, 100), ...block(60, 300)]
    expect(bestPowerAfterWork(ride, MASS, [0, 2], [60])).toEqual([
      { kjPerKg: 0, durationS: 60, watts: 400 },
      { kjPerKg: 2, durationS: 60, watts: 400 },
    ])
    // 2.4 kJ/kg is reached during the 400 W block (600·200 + 60·400 = 144,000 J), so only
    // what follows it counts.
    expect(bestPowerAfterWork(ride, MASS, [2.4], [60])).toEqual([
      { kjPerKg: 2.4, durationS: 60, watts: 300 },
    ])
  })

  it('starts the effort on the first second after the threshold, not before', () => {
    // 1 kJ/kg after exactly 300 s at 200 W; the best 10 s then starts at second 300.
    const ride = [...block(295, 200), ...block(10, 500), ...block(60, 200)]
    // Work before second 300 is 295·200 + 5·500 = 61,500 J ≥ 60,000 J, reached after second 297.
    const [best] = bestPowerAfterWork(ride, MASS, [1], [10])
    // Seconds 297–304 are at 500 W (8 s), then 2 s at 200 W.
    expect(best).toEqual({ kjPerKg: 1, durationS: 10, watts: (8 * 500 + 2 * 200) / 10 })
  })

  it('averages over the whole duration', () => {
    const ride = [...block(300, 200), ...block(30, 400), ...block(30, 100), ...block(300, 150)]
    expect(bestPowerAfterWork(ride, MASS, [1], [60, 300])).toEqual([
      { kjPerKg: 1, durationS: 60, watts: 250 },
      { kjPerKg: 1, durationS: 300, watts: (30 * 400 + 30 * 100 + 240 * 150) / 300 },
    ])
  })

  it('counts a missing sample as 0 W, in the work and in the effort', () => {
    const ride = [...block(300, 200), ...block(100, null), ...block(20, 300), ...block(40, null)]
    expect(bestPowerAfterWork(ride, MASS, [1], [60])).toEqual([
      { kjPerKg: 1, durationS: 60, watts: (20 * 300) / 60 },
    ])
    // The coasting does no work: 1.05 kJ/kg (63,000 J) is only reached 10 s into the 300 W block.
    expect(bestPowerAfterWork(ride, MASS, [1.05], [10])).toEqual([
      { kjPerKg: 1.05, durationS: 10, watts: 300 },
    ])
  })

  it('gives no entry for a threshold the ride never reaches', () => {
    const ride = block(600, 200) // 2 kJ/kg in total
    expect(bestPowerAfterWork(ride, MASS, [3], [60])).toEqual([])
    expect(bestPowerAfterWork(ride, MASS, [1, 3], [60]).map((b) => b.kjPerKg)).toEqual([1])
  })

  it('gives no entry for a duration that no longer fits after the threshold', () => {
    const ride = block(400, 200) // 1 kJ/kg after 300 s, 100 s left
    expect(bestPowerAfterWork(ride, MASS, [1], [60, 100, 101])).toEqual([
      { kjPerKg: 1, durationS: 60, watts: 200 },
      { kjPerKg: 1, durationS: 100, watts: 200 },
    ])
    expect(bestPowerAfterWork([], MASS, [0], [60])).toEqual([])
  })

  it('scales the threshold with body mass', () => {
    const ride = [...block(300, 200), ...block(60, 400), ...block(300, 200), ...block(60, 300)]
    // 60 kg: 1.2 kJ/kg = 72,000 J, reached in the 400 W block. 50 kg: 60,000 J, before it.
    expect(bestPowerAfterWork(ride, 60, [1.2], [60])[0]?.watts).toBe(300)
    expect(bestPowerAfterWork(ride, 50, [1.2], [60])[0]?.watts).toBe(400)
  })

  it('refuses a body mass or duration that is not positive', () => {
    expect(() => bestPowerAfterWork([200], 0, [1], [60])).toThrow(RangeError)
    expect(() => bestPowerAfterWork([200], Number.NaN, [1], [60])).toThrow(RangeError)
    expect(() => bestPowerAfterWork([200], MASS, [1], [0])).toThrow(RangeError)
    expect(() => bestPowerAfterWork([200], MASS, [1], [59.5])).toThrow(RangeError)
  })
})
