import { BarChart, LineChart, RadarChart, ScatterChart } from 'echarts/charts'
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  RadarComponent,
  TooltipComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import ReactEChartsCore from 'echarts-for-react/esm/core'
import type { ReactNode } from 'react'

// Register only what the dashboard uses, so the bundle stays small.
echarts.use([
  BarChart,
  LineChart,
  RadarChart,
  ScatterChart,
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  RadarComponent,
  TooltipComponent,
  SVGRenderer,
])

interface ChartProps {
  option: EChartsOption
  /** Short description for screen readers; the data table carries the detail. */
  label: string
  height?: number
  /** Optional data-table view under the chart. */
  table?: ReactNode
  /** Click on a data item, e.g. to open a rider profile. */
  onClick?: (params: { data?: unknown }) => void
}

export function Chart({ option, label, height = 280, table, onClick }: ChartProps) {
  return (
    <figure className="space-y-2">
      <div role="img" aria-label={label}>
        <ReactEChartsCore
          echarts={echarts}
          option={{ aria: { enabled: true }, animationDuration: 300, ...option }}
          style={{ height }}
          opts={{ renderer: 'svg' }}
          notMerge
          onEvents={onClick ? { click: onClick } : undefined}
        />
      </div>
      {table && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Show Data Table
          </summary>
          <div className="mt-2 overflow-x-auto">{table}</div>
        </details>
      )}
    </figure>
  )
}
