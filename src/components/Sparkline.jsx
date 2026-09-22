import './Sparkline.css'

/**
 * Orders per day, at a glance.
 *
 * Drawn to one scale so the line, its fill and the emphasised endpoint all
 * describe the same numbers. Colours come from tokens rather than literals, so
 * it follows the palette like everything else. Given fewer than two points
 * there is no shape to draw, and the caller shows its empty state instead.
 */
export default function Sparkline({ points, label }) {
  if (!points || points.length < 2) return null

  const width = 320
  const height = 56
  const pad = 4

  const max = Math.max(...points)
  const min = Math.min(...points)
  const span = max - min || 1

  const x = (i) => pad + (i * (width - pad * 2)) / (points.length - 1)
  const y = (v) => height - pad - ((v - min) / span) * (height - pad * 2)

  const line = points
    .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ')
  const area = `${line} L${x(points.length - 1).toFixed(1)},${height - pad} L${x(0).toFixed(1)},${height - pad} Z`

  const lastX = x(points.length - 1).toFixed(1)
  const lastY = y(points[points.length - 1]).toFixed(1)

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <path className="spark-area" d={area} />
      <path className="spark-line" d={line} />
      <circle className="spark-end" cx={lastX} cy={lastY} r="3.2" />
    </svg>
  )
}
