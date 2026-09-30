import { Link } from 'react-router-dom'
import { COPY } from '../content/copy'
import { STAFF_ROLES } from '../config/staff'
import { SECTION_IDS, detailPath } from '../config/staffNav'
import { dueOrders, lateOrders } from '../lib/sla'
import { formatDuration } from '../lib/format'
import './SlaWire.css'

/**
 * Orders that have passed what the customer was promised.
 *
 * The owner asked for an exception wire, and was right about why: a dashboard
 * that lists what is happening makes somebody read it and decide. This one only
 * appears when there is something to do, which is what makes it worth looking
 * at when it does.
 *
 * THE DEADLINE IS THE SHOP'S OWN PROMISE, not a number invented here. It comes
 * from `delivery_eta` and `pickup_eta` in shop_settings — the words printed on
 * the menu — so an order is late exactly when it has passed what the customer
 * was told. See lib/sla.js. When that text cannot be read as a number the
 * fallback applies, and the row says the deadline is assumed rather than
 * presenting a guess as the shop's word.
 *
 * Nothing is drawn when everything is inside its window. A permanent panel
 * reading "0 late" is a panel people stop seeing, which is the failure mode
 * this is supposed to prevent.
 */
export default function SlaWire({ orders, settings, now }) {
  const t = COPY.staff.sla

  const late = lateOrders(orders, { settings, now })
  const due = dueOrders(orders, { settings, now })

  if (late.length === 0 && due.length === 0) return null

  // Quietly, when nothing is actually late. Something approaching its deadline
  // is worth a line, not an alarm.
  if (late.length === 0) {
    return <p className="sla-quiet">{t.dueOnly(due.length)}</p>
  }

  return (
    <section className="sla" aria-labelledby="sla-title">
      <div className="sla-head">
        <h2 id="sla-title">{t.title(late.length)}</h2>
        {due.length > 0 && <span className="sla-due">{t.alsoDue(due.length)}</span>}
      </div>

      <ul className="sla-list">
        {late.map(({ order, sla }) => (
          <li key={order.id}>
            <Link
              className="sla-row"
              to={detailPath(STAFF_ROLES.admin, SECTION_IDS.orders, order.id)}
              aria-label={t.openOrder(order.orderNumber)}
            >
              <span className="sla-num">#{order.orderNumber}</span>
              <span className="sla-who">
                {order.customerName}
                <span className="sla-meta">
                  {t.promised(
                    COPY.staff.active.types[order.fulfillmentType] ?? order.fulfillmentType,
                    sla.limitMinutes,
                  )}
                  {/* Said out loud when the deadline is the fallback rather
                      than the shop's own words, so nobody acts on a number
                      they did not set believing they did. */}
                  {sla.assumed && <em className="sla-assumed"> {t.assumed}</em>}
                </span>
              </span>
              <span className="sla-over">{t.over(formatDuration(sla.overdueMinutes * 60))}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
