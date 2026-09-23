import OrderStatusTrail from './OrderStatusTrail'
import { COPY } from '../content/copy'
import { formatDateTime, formatPrice } from '../lib/format'
import { bucketOf } from '../lib/adminOrderList'
import './AdminOrders.css'

/**
 * One order in full.
 *
 * Three blocks, in the order someone actually asks about them: what was
 * ordered, who it is for, and where it has got to. The progress trail is the
 * customer's own component — the Admin answering "where is my order" should be
 * looking at the same picture the caller is describing.
 */
export default function AdminOrderDetail({ order }) {
  const t = COPY.staff.orders.detail
  const stage = COPY.track.statuses[order.status] ?? order.status
  const type = COPY.staff.active.types[order.fulfillmentType] ?? order.fulfillmentType

  return (
    <div className="aord-detail">
      <header className="aord-dhead">
        <div>
          <h1 className="aord-dnum">#{order.orderNumber}</h1>
          <p className="aord-dwhen">
            {t.placedAt} {formatDateTime(order.placedAt)}
          </p>
        </div>
        <div className="aord-dtags">
          <span className={`aord-pill ${bucketOf(order)}`}>{stage}</span>
          <span className="aord-pill type">{type}</span>
        </div>
      </header>

      <section className="panel aord-lines" aria-label={t.itemsTitle}>
        <h2>{t.itemsTitle}</h2>

        <div className="aord-scroll">
          <table className="aord-table">
            <thead>
              <tr>
                <th scope="col">{t.colItem}</th>
                <th scope="col" className="num">
                  {t.colQty}
                </th>
                <th scope="col" className="num">
                  {t.colEach}
                </th>
                <th scope="col" className="num">
                  {t.colLine}
                </th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((line) => (
                <tr key={line.id}>
                  <th scope="row">
                    <span className="aord-line-name">
                      {line.name} · {line.sizeLabel}
                    </span>
                    {/* The extras are priced into unit_price already, so they
                        are listed rather than given a row of their own — a
                        second row would look like a second charge. */}
                    {line.toppings.length > 0 && (
                      <span className="aord-line-extras">
                        {t.extras(line.toppings.map((topping) => topping.name).join(', '))}
                      </span>
                    )}
                  </th>
                  <td className="num">{line.quantity}</td>
                  <td className="num">{formatPrice(line.unitPrice)}</td>
                  <td className="num">{formatPrice(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="aord-totals">
          <div>
            <dt>{t.subtotal}</dt>
            <dd>{formatPrice(order.subtotal)}</dd>
          </div>
          {order.deliveryFee > 0 && (
            <div>
              <dt>{t.deliveryFee}</dt>
              <dd>{formatPrice(order.deliveryFee)}</dd>
            </div>
          )}
          <div className="aord-grand">
            <dt>{t.total}</dt>
            <dd>{formatPrice(order.total)}</dd>
          </div>
        </dl>
      </section>

      <section className="panel aord-customer" aria-label={t.customerTitle}>
        <h2>{t.customerTitle}</h2>

        {/* Name and phone are on every order, guest or not — checkout requires
            them, because that is how the food gets delivered. Only the account
            block below is conditional. */}
        <dl className="aord-facts">
          <div>
            <dt>{t.name}</dt>
            <dd>{order.customerName}</dd>
          </div>
          <div>
            <dt>{t.phone}</dt>
            <dd>
              <a href={`tel:${order.customerPhone}`}>{order.customerPhone}</a>
            </dd>
          </div>
          {order.address && (
            <div>
              <dt>{t.address}</dt>
              <dd>{order.address}</dd>
            </div>
          )}
          {order.notes && (
            <div>
              <dt>{t.notes}</dt>
              <dd>{order.notes}</dd>
            </div>
          )}
          {order.account && (
            <div>
              <dt>{t.email}</dt>
              <dd>
                {order.account.email}
                <span className="aord-meta"> · {t.orderCount(order.account.orderCount)}</span>
              </dd>
            </div>
          )}
        </dl>

        {!order.account && <p className="aord-guest">{t.guestNote}</p>}
      </section>

      <OrderStatusTrail
        status={order.status}
        fulfillmentType={order.fulfillmentType}
        history={order.statusHistory}
      />
    </div>
  )
}
