import { COPY } from '../content/copy'
import { formatPrice } from '../lib/format'
import './Dayparts.css'

/**
 * When the shop is actually busy, for writing a rota against.
 *
 * The owner's review asked for this by name: sales data is most useful for
 * scheduling labour, and a daily total cannot tell you whether to put a second
 * driver on at seven or at eleven.
 *
 * HORIZONTAL BARS, unlike the trend chart above it. These five buckets have
 * word labels — "Late night" does not fit under a column two characters wide —
 * and there are few enough of them that a row each is more readable than a
 * column each. The shape of the data decides the shape of the chart.
 *
 * The buckets, their order and their hours all come from sales_by_daypart().
 * Nothing here holds a second copy of that vocabulary, so the labels on screen
 * cannot drift from the boundaries that did the grouping. A quiet part of the
 * day comes back at zero rather than missing, and is drawn — "nobody orders
 * then" is a scheduling answer, and a gap in the list is not.
 */
export default function Dayparts({ rows, days, loading, errorCode, onRetry }) {
  const t = COPY.staff.dayparts

  if (loading) return <p aria-busy="true">{t.loading}</p>

  if (errorCode) {
    return (
      <div className="form-alert" role="alert">
        <p>{t.errors[errorCode] ?? t.errors.unknown}</p>
        {onRetry && (
          <button type="button" className="btn-ghost" onClick={onRetry}>
            {t.retry}
          </button>
        )}
      </div>
    )
  }

  if (!rows || rows.length === 0) return null

  const busiest = Math.max(...rows.map((row) => row.revenue))
  const anyTrade = busiest > 0
  const peak = anyTrade ? rows.find((row) => row.revenue === busiest) : null

  return (
    <section className="dayparts panel" aria-labelledby="dayparts-title">
      <h2 id="dayparts-title" className="staff-panel-title">
        {t.title}
      </h2>
      <p className="staff-note">{anyTrade ? t.subtitle(days, peak.name) : t.empty(days)}</p>

      <ul className="daypart-list">
        {rows.map((row) => (
          <li key={row.name} className={`daypart${row === peak ? ' is-peak' : ''}`}>
            <span className="daypart-name">
              {row.name}
              <span className="daypart-hours">{t.hours(row.startsHour, row.endsHour)}</span>
            </span>

            {/* Presentational: every figure it encodes sits beside it in words. */}
            <span className="daypart-bar" aria-hidden="true">
              <span
                className="daypart-fill"
                style={{ inlineSize: anyTrade ? `${(row.revenue / busiest) * 100}%` : '0%' }}
              />
            </span>

            <span className="daypart-orders">{t.orders(row.orders)}</span>
            <span className="daypart-revenue">{formatPrice(row.revenue)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
