import { describe, expect, it } from 'vitest'
import * as metrics from './index.ts'

describe('@prolog/metrics', () => {
  it('exports the public formulas', () => {
    expect(Object.keys(metrics).sort()).toEqual([
      'WELLNESS_SCALES',
      'ageInYears',
      'best',
      'caOnFmScale',
      'caStars',
      'isMeaningfulChange',
      'mean',
      'mostLikely',
      'normaliseWellness',
      'normaliseWellnessValue',
      'retainedPct',
      'trainingAgeYears',
    ])
  })
})
