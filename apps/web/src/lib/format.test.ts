import { describe, expect, it } from 'vitest'
import { formatDate, formatNumber, formatPercent } from '@/lib/format.ts'

describe('formatDate', () => {
  it('uses the house style', () => {
    expect(formatDate('2026-10-19')).toBe('19 October 2026')
    expect(formatDate('2027-01-01')).toBe('1 January 2027')
  })
})

describe('formatNumber', () => {
  it('uses a true minus sign', () => {
    expect(formatNumber(-7)).toBe('−7')
  })

  it('adds a plus sign when signed', () => {
    expect(formatNumber(6, 0, true)).toBe('+6')
    expect(formatNumber(3.25, 1, true)).toBe('+3.3')
  })

  it('never signs zero', () => {
    expect(formatNumber(0, 0, true)).toBe('0')
    expect(formatNumber(-0.04, 1)).toBe('0.0')
  })
})

describe('formatPercent', () => {
  it('rounds a probability to a whole percentage', () => {
    expect(formatPercent(0.837)).toBe('84%')
  })
})
