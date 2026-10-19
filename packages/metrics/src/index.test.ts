import { describe, expect, it } from 'vitest'
import * as metrics from './index.ts'

describe('@prolog/metrics', () => {
  it('exposes a module namespace', () => {
    expect(metrics).toBeTypeOf('object')
  })
})
