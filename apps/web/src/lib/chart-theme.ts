import { useMemo } from 'react'

export interface ChartTokens {
  series: [string, string, string]
  riderA: string
  riderB: string
  reference: string
  grid: string
  text: string
  muted: string
  surface: string
}

const FALLBACK: ChartTokens = {
  series: ['#3987e5', '#d95926', '#199e70'],
  riderA: '#e2bb7a',
  riderB: '#f6f1e7',
  reference: '#b8ad9a',
  grid: '#3a2c20',
  text: '#f6f1e7',
  muted: '#b8ad9a',
  surface: '#2e2218',
}

/** Theme colours from the CSS tokens in index.css, so charts follow the design system. */
export function useChartTokens(): ChartTokens {
  return useMemo(() => {
    const css = getComputedStyle(document.documentElement)
    const get = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
    return {
      series: [
        get('--chart-1', FALLBACK.series[0]),
        get('--chart-2', FALLBACK.series[1]),
        get('--chart-3', FALLBACK.series[2]),
      ],
      riderA: get('--gold', FALLBACK.riderA),
      riderB: get('--cream', FALLBACK.riderB),
      reference: get('--chart-reference', FALLBACK.reference),
      grid: get('--chart-grid', FALLBACK.grid),
      text: get('--cream', FALLBACK.text),
      muted: get('--muted-foreground', FALLBACK.muted),
      surface: get('--card', FALLBACK.surface),
    }
  }, [])
}

/** Shared tooltip look: card surface, text tokens, no series-coloured text. */
export function tooltipStyle(t: ChartTokens) {
  return {
    backgroundColor: t.surface,
    borderColor: t.grid,
    textStyle: { color: t.text, fontSize: 12 },
  }
}

/** Recessive axis styling shared by cartesian charts. */
export function axisStyle(t: ChartTokens) {
  return {
    axisLine: { lineStyle: { color: t.grid } },
    axisTick: { show: false },
    axisLabel: { color: t.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: t.grid } },
    nameTextStyle: { color: t.muted, fontSize: 11 },
  }
}
