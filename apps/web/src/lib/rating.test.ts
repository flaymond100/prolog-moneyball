import { describe, expect, it } from 'vitest'
import { ratingBand } from '@/lib/rating.ts'

describe('ratingBand', () => {
  it.each([
    [1, 1],
    [5, 1],
    [6, 2],
    [10, 2],
    [11, 3],
    [15, 3],
    [16, 4],
    [20, 4],
  ])('rating %d is band %d', (rating, band) => {
    expect(ratingBand(rating)).toBe(band)
  })

  it('rounds decimal ratings before banding', () => {
    expect(ratingBand(10.4)).toBe(2)
    expect(ratingBand(10.5)).toBe(3)
  })

  it('clamps out-of-range values', () => {
    expect(ratingBand(0)).toBe(1)
    expect(ratingBand(25)).toBe(4)
  })
})
