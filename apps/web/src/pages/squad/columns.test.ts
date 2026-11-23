import { describe, expect, it } from 'vitest'
import { METRICS } from '@/data/metric-registry.ts'
import { columnForMetric, squadColumns } from '@/pages/squad/columns.tsx'

// TODO 4.3 AC: adding a metric to the registry makes it available in the
// table, the scatter and the filters (the last two read METRICS directly).
describe('squad table and the metric registry', () => {
  it('shows every registry metric, in a hand-made or a plain column', () => {
    const ids = new Set(squadColumns.map((c) => c.id))
    for (const metric of METRICS) {
      expect(ids, metric.id).toContain(columnForMetric(metric.id) ?? metric.id)
    }
  })

  it('adds a plain column for a metric no hand-made column shows', () => {
    expect(columnForMetric('eftp')).toBeUndefined()
    expect(squadColumns.some((c) => c.id === 'eftp')).toBe(true)
  })
})
