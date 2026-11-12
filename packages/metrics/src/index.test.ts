import { describe, expect, it } from 'vitest'
import * as metrics from './index.ts'

describe('@prolog/metrics', () => {
  it('exports the public formulas', () => {
    expect(Object.keys(metrics).sort()).toEqual([
      'ATL_DAYS',
      'CTL_DAYS',
      'HRV_BASELINE_DAYS',
      'HRV_WINDOW_DAYS',
      'RATING_MAX',
      'RATING_MIN',
      'RIDER_TYPES',
      'SHAPE_LENGTH',
      'WELLNESS_SCALES',
      'ageInYears',
      'best',
      'caOnFmScale',
      'caStars',
      'currentAbility',
      'isMeaningfulChange',
      'lnRmssdStats',
      'mean',
      'mostLikely',
      'normaliseWellness',
      'normaliseWellnessValue',
      'primaryRiderType',
      'projectLoad',
      'ratingFromAnchors',
      'ratingFromBenchmark',
      'ratingFromZ',
      'retainedPct',
      'riderTypeProbs',
      'shapeVector',
      'squadPercentiles',
      'squadRatings',
      'trainingAgeYears',
    ])
  })
})
