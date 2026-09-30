import { COPY } from '../content/copy'
import { TOP_ITEMS_SHOWN } from '../config/insights'
import { formatPrice } from '../lib/format'
import './TopItems.css'

/**
 * What is actually selling, on the dashboard.
 *
 * This panel exists because two things left it: the delivery sheet moved to the
 * stock screen where the stock it books in lives, and the low-stock banner now
 * collapses to a line when there is nothing to act on. Both were occupying the
 * most valuable space on the screen to say "nothing to do here".
 *
 * Ranked, windowed and grouped by staff_top_items(); nothing is re-sorted here.
 * The bar is a share of the BEST SELLER rather than of the total, for the same
 * reason the usage table does it — shares of a total are all slivers once there
 * are a dozen items, whereas a bar that fills the width for the leader is
 * readable without reading a single number.
 */
export default function TopItems({ rows, days, loading, errorCode, onRetry }) {
  const t = COPY.staff.topItems

  /* Carries its own loading and failure states rather than handing them to the
     page, because the page deliberately does not block on this panel — see the
     note in ManagerDashboard. A panel that can fail alone has to be able to say
     so alone. */
  const shell = (children) => (
    <section className="top-items panel" aria-labelledby="top-items-title">
      <h2 id="top-items-title" className="staff-panel-title">
        {t.title}
      </h2>
      {children}
    </section>
  )

  if (loading) return shell(<p aria-busy="true">{t.loading}</p>)

  if (errorCode) {
    return shell(
      <div className="form-alert" role="alert">
        <p>{t.errors[errorCode] ?? t.errors.unknown}</p>
        {onRetry && (
          <button type="button" className="btn-ghost" onClick={onRetry}>
            {t.retry}
          </button>
        )}
      </div>,
    )
  }

  if (!rows || rows.length === 0) return shell(<p className="staff-note">{t.empty(days)}</p>)

  const shown = rows.slice(0, TOP_ITEMS_SHOWN)
  const best = shown[0].quantity || 1

  return (
    <section className="top-items panel" aria-labelledby="top-items-title">
      <h2 id="top-items-title" className="staff-panel-title">
        {t.title}
      </h2>
      <p className="staff-note">{t.subtitle(days)}</p>

      <ol className="top-list">
        {shown.map((row) => (
          <li key={row.id} className="top-row">
            <span className="top-name">{row.name}</span>

            {/* Presentational. The count sits beside it in words, so the bar
                carries no label of its own and stays out of the accessibility
                tree rather than announcing a second, wordless number. */}
            <span className="top-bar" aria-hidden="true">
              <span
                className="top-fill"
                style={{ inlineSize: `${Math.round((row.quantity / best) * 100)}%` }}
              />
            </span>

            <span className="top-qty">{t.sold(row.quantity)}</span>
            <span className="top-revenue">{formatPrice(row.revenue)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
