import { describe, expect, it } from 'vitest'
import { isMeaningfulChange } from './lab.ts'

describe('isMeaningfulChange', () => {
  it('is meaningful above the typical error, either direction', () => {
    expect(isMeaningfulChange(2.5, 2)).toBe(true)
    expect(isMeaningfulChange(-2.5, 2)).toBe(true)
  })

  it('is not meaningful at or below the typical error', () => {
    expect(isMeaningfulChange(2, 2)).toBe(false)
    expect(isMeaningfulChange(0.5, 2)).toBe(false)
  })

  it('is null without a usable typical error', () => {
    expect(isMeaningfulChange(3, null)).toBeNull()
    expect(isMeaningfulChange(3, 0)).toBeNull()
  })
})
