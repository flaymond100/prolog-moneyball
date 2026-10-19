import type { DatedValue } from '@/data/types.ts'

interface SparklineProps {
  values: DatedValue[]
  label: string
  width?: number
  height?: number
}

/** A tiny trend line; the label carries the numbers for screen readers. */
export function Sparkline({ values, label, width = 120, height = 32 }: SparklineProps) {
  if (values.length < 2) return null
  const ys = values.map((v) => v.value)
  const lo = Math.min(...ys)
  const hi = Math.max(...ys)
  const span = hi - lo || 1
  const pad = 3
  const points = ys
    .map((y, i) => {
      const px = pad + (i / (ys.length - 1)) * (width - 2 * pad)
      const py = height - pad - ((y - lo) / span) * (height - 2 * pad)
      return `${px.toFixed(1)},${py.toFixed(1)}`
    })
    .join(' ')
  const last = points.split(' ').at(-1)?.split(',') ?? ['0', '0']

  return (
    <svg role="img" aria-label={label} width={width} height={height} className="overflow-visible">
      <title>{label}</title>
      <polyline
        points={points}
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={last[0]}
        cy={last[1]}
        r={3}
        fill="var(--chart-1)"
        stroke="var(--card)"
        strokeWidth={2}
      />
    </svg>
  )
}
