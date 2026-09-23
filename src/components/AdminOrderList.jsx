import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { COPY } from '../content/copy'
import { STAFF_ROLES } from '../config/staff'
import { SECTION_IDS, detailPath } from '../config/staffNav'
import { ADMIN_ORDERS_LIMIT } from '../config/adminOrders'
import {
  ALL_ORDER_VIEWS,
  ORDER_VIEWS,
  bucketOf,
  countsByView,
  filterOrders,
} from '../lib/adminOrderList'
import { formatDateTime, formatPrice } from '../lib/format'
import './AdminOrders.css'

/**
 * Every recent order, newest first.
 *
 * A list to scan, not a report. What tells two orders apart at a glance is the
 * number, who it is for, how big it is and where it has got to — so those are
 * what a row carries, and everything else is one click away.
 *
 * The default view is "in progress", because the orders that need looking at
 * are the ones that have not finished. It falls back to "all" when nothing is
 * open, so the screen is never an empty state sitting on top of a full list —
 * the same mistake the stock table shipped with and had to be fixed.
 */
export default function AdminOrderList({ orders }) {
  const t = COPY.staff.orders

  const counts = useMemo(() => countsByView(orders), [orders])
  const [view, setView] = useState(() =>
    counts[ORDER_VIEWS.active] > 0 ? ORDER_VIEWS.active : ORDER_VIEWS.all,
  )
  const [query, setQuery] = useState('')
  const searchId = useId()

  const shown = useMemo(() => filterOrders(orders, { view, query }), [orders, view, query])

  if (orders.length === 0) return <p className="aord-empty">{t.empty}</p>

  return (
    <div className="aord">
      <div className="aord-controls">
        <div className="stock-search">
          <label className="sr-only" htmlFor={searchId}>
            {t.searchLabel}
          </label>
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M10.5 10.5 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <input
            id={searchId}
            type="search"
            value={query}
            placeholder={t.searchLabel}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="aord-filters" role="group" aria-label={t.filterLabel}>
          {ALL_ORDER_VIEWS.map((key) => (
            <button
              key={key}
              type="button"
              className="chip"
              aria-pressed={view === key}
              onClick={() => setView(key)}
            >
              {t.filterCount(t.filters[key], counts[key])}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 && <p className="aord-empty">{t.noMatch}</p>}

      {shown.length > 0 && (
        <>
          <ul className="aord-list">
            {shown.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </ul>

          {shown.length < orders.length && (
            <p className="aord-showing">{t.showing(shown.length, orders.length)}</p>
          )}
          {orders.length >= ADMIN_ORDERS_LIMIT && (
            <p className="aord-showing">{t.capped(ADMIN_ORDERS_LIMIT)}</p>
          )}
        </>
      )}
    </div>
  )
}

function OrderRow({ order }) {
  const t = COPY.staff.orders

  /* Stage names come from COPY.track.statuses — the same words the customer
     reads on their own tracking page. Two vocabularies for one ladder is a
     support call waiting to happen. */
  const stage = COPY.track.statuses[order.status] ?? order.status
  const type = COPY.staff.active.types[order.fulfillmentType] ?? order.fulfillmentType

  const meta = [
    order.customerName,
    t.itemCount(order.itemCount),
    type,
    order.hasAccount ? t.hasAccount : t.guest,
  ].join(' · ')

  return (
    <li>
      {/* The whole row is the link, so the target is a row rather than a word. */}
      <Link
        className="aord-row"
        to={detailPath(STAFF_ROLES.admin, SECTION_IDS.orders, order.id)}
        aria-label={t.openOrder(order.orderNumber)}
      >
        <span className="aord-num">#{order.orderNumber}</span>

        <span className="aord-id">
          <strong>{meta}</strong>
          <span className="aord-meta">{formatDateTime(order.placedAt)}</span>
        </span>

        <span className="aord-total">{formatPrice(order.total)}</span>

        <span className={`aord-pill ${bucketOf(order)}`}>{stage}</span>

        <svg className="aord-chev" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <path
            d="M6 3l5 5-5 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </li>
  )
}
