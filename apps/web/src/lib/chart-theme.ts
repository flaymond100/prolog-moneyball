import { useMemo } from 'react'

export interface ChartTokens {
  series: [string, string, string, string, string]
  riderA: string
  riderB: string
  riderC: string
  riderD: string
  reference: string
  grid: string
  text: string
  muted: string
  surface: string
}

const FALLBACK: ChartTokens = {
  series: ['#6250d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
  riderA: '#6250d6',
  riderB: '#eb6834',
  riderC: '#1baf7a',
  riderD: '#eda100',
  reference: '#8a889c',
  grid: '#ecebf3',
  text: '#1d1b30',
  muted: '#5f5d75',
  surface: '#ffffff',
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
        get('--chart-4', FALLBACK.series[3]),
        get('--chart-5', FALLBACK.series[4]),
      ],
      riderA: get('--rider-a', FALLBACK.riderA),
      riderB: get('--rider-b', FALLBACK.riderB),
      riderC: get('--rider-c', FALLBACK.riderC),
      riderD: get('--rider-d', FALLBACK.riderD),
      reference: get('--chart-reference', FALLBACK.reference),
      grid: get('--chart-grid', FALLBACK.grid),
      text: get('--foreground', FALLBACK.text),
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
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: t.text, fontSize: 12 },
    extraCssText: 'border-radius: 10px; box-shadow: 0 4px 16px rgb(29 27 48 / 0.10);',
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
