import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BackLink from '../components/BackLink'
import AuthPanel from '../components/AuthPanel'
import { ClockIcon, ReceiptIcon } from '../components/icons'
import { COPY } from '../content/copy'
import { ROUTES, trackPath } from '../config/routes'
import { useAuth } from '../context/AuthContext'
import { fetchMyOrders } from '../api/orders'
import { formatPrice, formatDateTime } from '../lib/format'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import './Orders.css'

/**
 * FR-3.4: past orders for customers with an account.
 *
 * Which orders come back is decided entirely by RLS — see fetchMyOrders(). This
 * page never asks for "my" orders, it asks for orders, and the database answers
 * with the ones belonging to the session.
 */
export default function Orders() {
  const { isSignedIn, ready, email, signOut } = useAuth()
  const t = COPY.orders

  useDocumentTitle(t.title)

  if (!ready) {
    return (
      <section className="wrap orders-page" aria-label={t.ariaLabel}>
        <p className="orders-msg">{COPY.common.loading}</p>
      </section>
    )
  }

  return (
    <section className="wrap orders-page" aria-label={t.ariaLabel}>
      <BackLink to={ROUTES.home} label={COPY.nav.backToHome} />

      <div className="orders-head">
        <h1>{t.title}</h1>
        {isSignedIn && (
          <p className="orders-account">
            {t.signedInAs} <strong>{email}</strong>
            <button type="button" onClick={signOut}>
              {t.signOut}
            </button>
          </p>
        )}
      </div>

      {isSignedIn ? <OrderHistory /> : <SignedOut />}

      <div className="orders-guest-note">
        <strong>{t.guestNoteTitle}</strong>
        <p>{t.guestNoteBody}</p>
        <Link to={ROUTES.track}>{t.guestNoteAction}</Link>
      </div>
    </section>
  )
}

function SignedOut() {
  const t = COPY.orders

  return (
    <div className="orders-signedout">
      <p className="orders-signedout-lede">{t.signedOutBody}</p>
      {/* No onClose: there is no guest path out of an account-only page. */}
      <AuthPanel />
    </div>
  )
}

function OrderHistory() {
  const t = COPY.orders
  const [orders, setOrders] = useState(null)
  const [state, setState] = useState('loading')

  const load = useCallback(async () => {
    setState('loading')
    try {
      setOrders(await fetchMyOrders())
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (state === 'loading') return <p className="orders-msg">{t.loading}</p>

  if (state === 'error') {
    return (
      <div className="orders-empty">
        <strong>{t.loadError}</strong>
        <button type="button" className="btn-solid" onClick={load}>
          {COPY.common.retry}
        </button>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="orders-empty">
        <strong>{t.emptyTitle}</strong>
        <p>{t.emptyBody}</p>
        <Link to={ROUTES.menu} className="btn-solid">
          {t.browseMenu}
        </Link>
      </div>
    )
  }

  return (
    <>
      <p className="orders-count">{t.countHeading(orders.length)}</p>
      <ul className="orders-list">
        {orders.map((order) => (
          <OrderRow key={order.id} order={order} />
        ))}
      </ul>
    </>
  )
}

function OrderRow({ order }) {
  const t = COPY.orders

  return (
    <li className="orders-row">
      {/* The whole card is the link, so a thumb does not have to find the one
          small "view" target at the end of the row. */}
      <Link to={trackPath(order.accessToken)} className="orders-link">
        <span className="orders-row-top">
          <span className="orders-number">
            <ReceiptIcon />#{order.orderNumber}
          </span>
          <span className={`orders-status is-${order.status}`}>
            {COPY.track.statuses[order.status] ?? order.status}
          </span>
        </span>

        <span className="orders-items">{t.itemSummary(order.items)}</span>

        <span className="orders-row-bottom">
          <span className="orders-when">
            <ClockIcon />
            {formatDateTime(order.placedAt)}
            <span className="orders-type">· {order.isDelivery ? t.delivery : t.pickup}</span>
          </span>
          <span className="orders-total">{formatPrice(order.total)}</span>
        </span>
      </Link>
    </li>
  )
}
