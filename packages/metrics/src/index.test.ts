import { describe, expect, it } from 'vitest'
import * as metrics from './index.ts'

describe('@prolog/metrics', () => {
  it('exports the public formulas', () => {
    expect(Object.keys(metrics).sort()).toEqual([
      'ageInYears',
      'best',
      'caOnFmScale',
      'caStars',
      'mean',
      'mostLikely',
      'retainedPct',
      'trainingAgeYears',
    ])
  })
})
