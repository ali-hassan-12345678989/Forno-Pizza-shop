import { useMemo } from 'react'
import { COPY } from '../content/copy'
import { groupByReason } from '../lib/cancellations'
import { formatDateTime, formatPrice } from '../lib/format'
import './CancelledOrders.css'

/**
 * The cancellations behind the summary figure.
 *
 * WHY THIS EXISTS. The owner opened the sales screen, saw "168 cancelled"
 * beside "6 orders", and read it as the shop bleeding customers. It was not —
 * those were the regression suite's test orders, and the go-live reset has
 * since cleared them. But the reaction was the right one to design for: a
 * number that alarming should be something you can open, not something you have
 * to take on trust and worry about.
 *
 * WHY THE REASONS ARE THE CUSTOMER'S. The review asked to break these down by
 * kitchen error, delivery failure and test order. Staff cannot cancel an order
 * in this system at all — set_order_status() walks an order along
 * order_status_flow(), and 'cancelled' is not on that ladder. The only path is
 * cancel_order(), which needs the customer's own access token and refuses once
 * the kitchen has started. So every cancellation this shop records is somebody
 * changing their mind before anything was cooked, and the question worth asking
 * is why — which is what the tracking page now asks them.
 *
 * Orders cancelled before that question existed have no answer, and they are
 * shown as a group of their own rather than dropped. A breakdown that quietly
 * omitted them would not add up to the total printed above it.
 */
export default function CancelledOrders({ rows, days, total, loading, errorCode, onRetry }) {
  const t = COPY.staff.cancelled

  const groups = useMemo(() => groupByReason(rows), [rows])

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

  if (!rows || rows.length === 0) return <p className="cancelled-empty">{t.empty(days)}</p>

  return (
    <div className="cancelled">
      {/* The TRUE total, not the number of rows fetched. staff_cancelled_orders()
          caps at 200, so on a busy month this list is a window onto a larger
          figure — and a sentence saying "200 cancelled orders" directly under a
          summary reading 210 is the kind of quiet contradiction that makes a
          reader distrust both numbers. */}
      <p className="staff-note">{t.intro(total ?? rows.length, days)}</p>

      <ul className="cancelled-reasons">
        {groups.map((group) => (
          <li key={group.reason ?? 'unknown'}>
            <span className="cancelled-reason">
              {group.reason ? (t.reasons[group.reason] ?? group.reason) : t.reasons.notGiven}
            </span>
            <span className="cancelled-count">{group.count}</span>
          </li>
        ))}
      </ul>

      <p className="cancelled-showing">{t.showing(rows.length, total ?? rows.length)}</p>

      <div className="cancelled-scroll">
        <table className="cancelled-table">
          <thead>
            <tr>
              <th scope="col">{t.colOrder}</th>
              <th scope="col">{t.colWhen}</th>
              <th scope="col">{t.colReason}</th>
              <th scope="col" className="num">
                {t.colTotal}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.orderNumber}>
                <th scope="row">
                  {t.orderNumber(row.orderNumber)}
                  <span className="cancelled-who">{row.customerName}</span>
                </th>
                <td>{formatDateTime(row.createdAt)}</td>
                <td>
                  {row.reason ? (
                    (t.reasons[row.reason] ?? row.reason)
                  ) : (
                    <span className="cancelled-unknown">{t.reasons.notGiven}</span>
                  )}
                </td>
                <td className="num">{formatPrice(row.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
