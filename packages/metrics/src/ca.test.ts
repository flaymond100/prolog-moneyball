import { describe, expect, it } from 'vitest'
import { caOnFmScale, caStars } from './ca.ts'

describe('caOnFmScale', () => {
  it.each([
    [13.9, 139],
    [14.2, 142],
    [20, 200],
    [1, 10],
    [14.25, 143],
  ])('CA %d → %d', (ca, expected) => {
    expect(caOnFmScale(ca)).toBe(expected)
  })
})

describe('caStars', () => {
  it.each([
    [20, 5],
    [14.2, 3.5], // 3.55 → 3.5
    [13.9, 3.5], // 3.475 → 3.5
    [15, 4], // 3.75 → 4
    [12.9, 3], // 3.225 → 3
    [1, 0.5], // 0.25 → 0.5
  ])('CA %d → %d stars', (ca, expected) => {
    expect(caStars(ca)).toBe(expected)
  })
})
