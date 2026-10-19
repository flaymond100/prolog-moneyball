import { describe, expect, it } from 'vitest'
import { best, mean, mostLikely } from './summary.ts'

describe('mean', () => {
  it('averages present values', () => {
    expect(mean([10, 17])).toBe(13.5)
  })

  it('skips missing values', () => {
    expect(mean([10, null, 14])).toBe(12)
  })

  it('is null when nothing is present', () => {
    expect(mean([])).toBeNull()
    expect(mean([null])).toBeNull()
  })
})

describe('best', () => {
  it('returns the highest present value', () => {
    expect(best([10, null, 17])).toBe(17)
  })

  it('is null when nothing is present', () => {
    expect(best([null, null])).toBeNull()
  })
})

describe('mostLikely', () => {
  it('returns the most probable key', () => {
    expect(mostLikely({ sprinter: 0.1, climber: 0.8, rouleur_tt: 0.1 })).toBe('climber')
  })

  it('keeps the first key on a tie', () => {
    expect(mostLikely({ puncheur: 0.5, climber: 0.5 })).toBe('puncheur')
  })

  it('is null for an empty record', () => {
    expect(mostLikely({})).toBeNull()
  })
})
