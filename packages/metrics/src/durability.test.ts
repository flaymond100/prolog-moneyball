import { describe, expect, it } from 'vitest'
import { retainedPct } from './durability.ts'

describe('retainedPct', () => {
  it('divides post-fatigue by fresh power', () => {
    expect(retainedPct(5.75, 5.35)).toBeCloseTo(93.04, 2)
  })

  it('is null without fresh power', () => {
    expect(retainedPct(0, 4)).toBeNull()
  })
})
