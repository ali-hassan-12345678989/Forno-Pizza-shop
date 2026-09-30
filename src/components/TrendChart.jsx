import './TrendChart.css'

/**
 * Revenue over time, as columns.
 *
 * The owner's review: the Daily / Monthly / Yearly toggle only ever changed a
 * static table, so a peak was something you found by reading down a column of
 * figures. A chart is how you see one.
 *
 * COLUMNS RATHER THAN A LINE. A line implies a continuous quantity sampled at
 * intervals — a temperature, a price. Takings are a total per bucket, and a
 * column that stands on the day it belongs to says that. It also renders a
 * single day honestly, where a line of one point has nothing to draw.
 *
 * WHAT IT DOES NOT DO IS INVENT A SCALE. The tallest column is the largest
 * figure in the window and every other is drawn against it, so the shape is
 * true even though there is no axis — and the table underneath carries every
 * exact number, which is why this is allowed to be a shape rather than a grid.
 * Only three labels are printed: the first bucket, the last, and the peak.
 * Thirty labels along the foot of a chart this size is a grey smear.
 */
export default function TrendChart({ points, label, formatValue, formatLabel }) {
  /* Two buckets minimum. One column has no shape to show — it is its own peak
     and its own floor — and drawn across the full width it renders as a solid
     slab of colour that reads as a broken chart rather than as a quiet week.
     The table underneath already carries that single figure. */
  if (!points || points.length < 2) return null

  const max = Math.max(...points.map((p) => p.value))
  const peakAt = points.findIndex((p) => p.value === max)

  // A window where nothing was taken has no shape to draw, and a chart of
  // zero-height columns reads as a broken chart rather than a quiet month.
  if (max <= 0) return null

  const lastAt = points.length - 1

  return (
    <div className="trend" role="img" aria-label={label}>
      <div className="trend-plot" style={{ '--trend-count': points.length }}>
        {points.map((point, index) => (
          <div
            key={point.key}
            className={`trend-col${index === peakAt ? ' is-peak' : ''}`}
            /* Percentages of the tallest column. A zero-value bucket still
               draws a hairline, so a day the shop took nothing is visibly a
               day that happened rather than a gap in the chart. */
            style={{ '--trend-height': `${Math.max((point.value / max) * 100, 1.5)}%` }}
          >
            <span className="trend-bar" />
          </div>
        ))}
      </div>

      <div className="trend-axis" style={{ '--trend-count': points.length }}>
        {points.map((point, index) => {
          const show = index === 0 || index === lastAt || index === peakAt
          return (
            <span key={point.key} className={`trend-tick${index === peakAt ? ' is-peak' : ''}`}>
              {show ? formatLabel(point) : ''}
            </span>
          )
        })}
      </div>

      <p className="trend-peak">{formatValue(points[peakAt])}</p>
    </div>
  )
}
