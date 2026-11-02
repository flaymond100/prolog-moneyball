import { describe, expect, it } from 'vitest'
import {
  WELLNESS_SCALES,
  normaliseWellness,
  normaliseWellnessValue,
  type WellnessField,
} from './wellness.ts'

const FIELDS = Object.keys(WELLNESS_SCALES) as WellnessField[]

describe('normaliseWellnessValue', () => {
  it('maps the best answer to 1 and the worst to 0 for every field', () => {
    for (const field of FIELDS) {
      const { best, worst } = WELLNESS_SCALES[field]
      expect(normaliseWellnessValue(field, best)).toBe(1)
      expect(normaliseWellnessValue(field, worst)).toBe(0)
    }
  })

  // TODO 3.8 AC: higher always means better.
  it('rises as the answer improves, whichever way the raw scale runs', () => {
    for (const field of FIELDS) {
      const { best, worst } = WELLNESS_SCALES[field]
      const step = best < worst ? 1 : -1
      const fromWorst: number[] = []
      for (let v = worst; v !== best - step; v -= step) fromWorst.push(v)
      const normalised = fromWorst.map((v) => normaliseWellnessValue(field, v) ?? Number.NaN)
      for (let i = 1; i < normalised.length; i++) {
        expect(normalised[i]).toBeGreaterThan(normalised[i - 1] ?? Infinity)
      }
    }
  })

  it('follows the KB §4 scales', () => {
    expect(normaliseWellnessValue('sleepQuality', 2)).toBeCloseTo(2 / 3) // 1 excellent … 4 poor
    expect(normaliseWellnessValue('mood', 3)).toBeCloseTo(1 / 3)
    expect(normaliseWellnessValue('soreness', 1)).toBe(0.75) // 0 none … 4 extreme
    expect(normaliseWellnessValue('stress', 3)).toBe(0.25)
    expect(normaliseWellnessValue('injury', 4)).toBe(0) // 4 injured
  })

  it('is null for missing, non-finite or out-of-scale values', () => {
    expect(normaliseWellnessValue('mood', null)).toBeNull()
    expect(normaliseWellnessValue('mood', undefined)).toBeNull()
    expect(normaliseWellnessValue('mood', Number.NaN)).toBeNull()
    expect(normaliseWellnessValue('mood', 0)).toBeNull()
    expect(normaliseWellnessValue('fatigue', 5)).toBeNull()
    expect(normaliseWellnessValue('fatigue', -1)).toBeNull()
  })
})

describe('normaliseWellness', () => {
  it('normalises every field and fills the missing ones with null', () => {
    expect(normaliseWellness({ sleepQuality: 1, fatigue: 2, injury: null })).toEqual({
      sleepQuality: 1,
      mood: null,
      motivation: null,
      soreness: null,
      fatigue: 0.5,
      stress: null,
      injury: null,
    })
  })
})
