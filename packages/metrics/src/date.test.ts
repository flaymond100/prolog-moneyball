import { describe, expect, it } from 'vitest'
import { daysBetween, parseIsoDate } from './date.ts'

describe('parseIsoDate', () => {
  it('reads a date as midnight UTC', () => {
    expect(parseIsoDate('2026-11-10').toISOString()).toBe('2026-11-10T00:00:00.000Z')
  })

  it('rejects anything else', () => {
    expect(() => parseIsoDate('10 November 2026')).toThrow(RangeError)
  })
})

describe('daysBetween', () => {
  it('counts whole days, across a DST change and backwards', () => {
    expect(daysBetween('2026-10-20', '2026-11-10')).toBe(21)
    expect(daysBetween('2026-11-10', '2026-11-03')).toBe(-7)
    expect(daysBetween('2026-11-10', '2026-11-10')).toBe(0)
  })
})
