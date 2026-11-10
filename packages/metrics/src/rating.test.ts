import { describe, expect, it } from 'vitest'
import { ratingFromAnchors, ratingFromZ } from './rating.ts'

describe('ratingFromZ', () => {
  // KB §6 worked examples, benchmark set "Female Pro + Coggan provisional".
  it('rates the pro mean 15', () => {
    expect(ratingFromZ(15.3, 15.3, 1.8)).toBe(15) // 5 s
  })

  it('rates 60 min at 4.1 W/kg about 14.4', () => {
    expect(ratingFromZ(4.1, 4.2, 0.4)).toBeCloseTo(14.375, 10)
  })

  it('gives 2.5 points per SD: +2 SD rates 20, −2 SD rates 10', () => {
    expect(ratingFromZ(8.4 + 2 * 0.8, 8.4, 0.8)).toBeCloseTo(20, 10) // 1 min
    expect(ratingFromZ(8.4 - 2 * 0.8, 8.4, 0.8)).toBeCloseTo(10, 10)
  })

  it('clamps to 1–20', () => {
    expect(ratingFromZ(25, 15.3, 1.8)).toBe(20)
    expect(ratingFromZ(2, 15.3, 1.8)).toBe(1)
  })

  it('rejects an SD that is not positive', () => {
    expect(() => ratingFromZ(4, 4.2, 0)).toThrow(RangeError)
    expect(() => ratingFromZ(4, 4.2, Number.NaN)).toThrow(RangeError)
  })
})

describe('ratingFromAnchors', () => {
  // KB §6 seeds.
  const P5M = { values: [4.65, 5.2, 5.8], ratings: [9, 12, 15] }
  const DURABILITY = { values: [85, 90, 95, 100], ratings: [9, 12, 15, 18] }
  const rate5m = (x: number) => ratingFromAnchors(x, P5M.values, P5M.ratings)
  const rateDurability = (x: number) => ratingFromAnchors(x, DURABILITY.values, DURABILITY.ratings)

  it('hits every anchor exactly', () => {
    expect(rate5m(4.65)).toBeCloseTo(9, 10)
    expect(rate5m(5.2)).toBeCloseTo(12, 10)
    expect(rate5m(5.8)).toBeCloseTo(15, 10)
    expect(rateDurability(95)).toBeCloseTo(15, 10)
  })

  it('interpolates linearly between anchors', () => {
    expect(rate5m(5.5)).toBeCloseTo(13.5, 10)
    expect(rateDurability(92.5)).toBeCloseTo(13.5, 10)
    expect(ratingFromAnchors(60, [50, 57, 63, 70], [9, 12, 15, 18])).toBeCloseTo(13.5, 10) // VO2max
  })

  it('extrapolates with the nearest slope', () => {
    expect(rate5m(6.1)).toBeCloseTo(16.5, 10) // 5 points per W/kg above 5.80
    expect(rate5m(4.1)).toBeCloseTo(6, 10) // 3 ÷ 0.55 points per W/kg below 4.65
    expect(rateDurability(102)).toBeCloseTo(19.2, 10)
  })

  it('clamps to 1–20', () => {
    expect(rateDurability(110)).toBe(20)
    expect(rateDurability(50)).toBe(1)
  })

  it('rejects anchors the benchmark table would reject', () => {
    expect(() => ratingFromAnchors(5, [5], [12])).toThrow(RangeError)
    expect(() => ratingFromAnchors(5, [4, 5], [12])).toThrow(RangeError)
    expect(() => ratingFromAnchors(5, [4, 5], [9, 12, 15])).toThrow(RangeError)
    expect(() => ratingFromAnchors(5, [4, 5, 5], [9, 12, 15])).toThrow(RangeError)
  })
})
