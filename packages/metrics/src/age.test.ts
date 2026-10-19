import { describe, expect, it } from 'vitest'
import { ageInYears, trainingAgeYears } from './age.ts'

describe('ageInYears', () => {
  it('counts a birthday earlier in the year', () => {
    expect(ageInYears('2000-05-14', '2026-10-19')).toBe(26)
  })

  it('counts the birthday itself', () => {
    expect(ageInYears('2000-10-19', '2026-10-19')).toBe(26)
  })

  it('does not count a birthday later in the month', () => {
    expect(ageInYears('2000-10-20', '2026-10-19')).toBe(25)
  })

  it('does not count a birthday in a later month', () => {
    expect(ageInYears('2005-11-02', '2026-10-19')).toBe(20)
  })

  it('rejects an invalid date', () => {
    expect(() => ageInYears('not-a-date', '2026-10-19')).toThrow(RangeError)
  })
})

describe('trainingAgeYears', () => {
  it('equals the entered value on the entry date', () => {
    expect(trainingAgeYears(3, '2026-01-01', '2026-01-01')).toBe(3)
  })

  it('adds the years since entry', () => {
    expect(trainingAgeYears(6, '2025-10-19', '2026-10-19')).toBeCloseTo(7, 2)
  })

  it('adds part of a year', () => {
    expect(trainingAgeYears(3, '2026-01-01', '2026-10-19')).toBeCloseTo(3.8, 1)
  })
})
