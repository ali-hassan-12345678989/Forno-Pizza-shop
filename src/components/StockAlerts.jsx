import { COPY } from '../content/copy'
import { formatDateTime, formatQuantity } from '../lib/format'
import './StockAlerts.css'

/**
 * FR-5.4, and Part 4's "a low-stock alert is actually visible on screen".
 *
 * Part 3 has been writing stock_alerts rows since the deduction engine went
 * in; until now nothing read them. This is that screen.
 *
 * Deliberately shows only what the database calls open. An alert closes itself
 * when a delivery lifts the ingredient back over its threshold, so this list
 * empties without anyone dismissing anything — there is no "mark as read" to
 * get out of step with the stock it describes.
 */
export default function StockAlerts({ alerts }) {
  const t = COPY.staff.alerts

  if (alerts.length === 0) {
    return (
      <section className="alerts alerts-clear" aria-labelledby="alerts-title">
        <h2 id="alerts-title">{t.title}</h2>
        <p>{t.none}</p>
      </section>
    )
  }

  return (
    <section className="alerts" aria-labelledby="alerts-title">
      <div className="alerts-head">
        <h2 id="alerts-title">{t.title}</h2>
        <span className="alerts-count">{t.count(alerts.length)}</span>
      </div>

      <ul className="alerts-list">
        {alerts.map((a) => {
          const isOut = a.currentStock === 0
          return (
            <li key={a.id} className={isOut ? 'alert out' : 'alert'}>
              <div className="alert-main">
                <strong className="alert-name">{a.name}</strong>
                {isOut && <span className="alert-badge">{t.outNow}</span>}
              </div>
              <p className="alert-levels">
                {t.nowAt(
                  formatQuantity(a.currentStock, a.unit),
                  formatQuantity(a.threshold, a.unit),
                )}
              </p>
              <p className="alert-when">{t.triggered(formatDateTime(a.triggeredAt))}</p>
              {/* An open alert should always still be below. If it is not,
                  note_stock_level() missed a crossing and the Manager is
                  looking at a warning that is no longer true — say so rather
                  than quietly showing a healthy ingredient as a problem. */}
              {!a.stillBelow && <p className="alert-stale">{t.staleWarning}</p>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
