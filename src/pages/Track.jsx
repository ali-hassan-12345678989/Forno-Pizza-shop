import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import BackLink from '../components/BackLink'
import { CashIcon, CheckIcon, ClockIcon, CopyIcon, PinIcon, ReceiptIcon } from '../components/icons'
import { COPY } from '../content/copy'
import { ROUTES, trackPath, tokenFromInput } from '../config/routes'
import { STORAGE_KEYS, readStored } from '../config/storage'
import { useShop } from '../context/SettingsContext'
import { useAuth } from '../context/AuthContext'
import { fetchOrderByToken } from '../api/orders'
import { formatPrice, formatTime } from '../lib/format'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import './Track.css'

/**
 * One page, two jobs.
 *
 * Straight after checkout it is the confirmation screen; the URL in the address
 * bar is already the tracking link, so there is nothing for the customer to
 * copy down before it disappears. Come back to that same URL a day later — new
 * browser, no account — and it is the order lookup. That is what makes the link
 * a guest's way back to their order, rather than a one-time screen.
 */
export default function Track() {
  const { token } = useParams()
  return token ? <TrackedOrder token={token} /> : <OrderLookup />
}

function TrackedOrder({ token }) {
  const location = useLocation()
  // Placing the order already returned it in full, so arriving from checkout
  // renders immediately instead of asking for it straight back.
  const handedOver = location.state?.order ?? null
  const justPlaced = Boolean(location.state?.justPlaced)

  const [order, setOrder] = useState(handedOver)
  const [state, setState] = useState(handedOver ? 'ready' : 'loading')

  const load = useCallback(async () => {
    setState('loading')
    try {
      const found = await fetchOrderByToken(token)
      setOrder(found)
      setState(found ? 'ready' : 'notFound')
    } catch {
      setState('error')
    }
  }, [token])

  useEffect(() => {
    if (!handedOver) load()
    // handedOver is read once on mount; re-running on it would refetch an order
    // we were just given.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load])

  if (state === 'loading') {
    return (
      <section className="wrap track-page" aria-label={COPY.track.ariaLabel}>
        <p className="track-status-msg">{COPY.common.loading}</p>
      </section>
    )
  }

  if (state === 'notFound' || state === 'error') {
    const isMissing = state === 'notFound'
    return (
      <section className="wrap track-page" aria-label={COPY.track.ariaLabel}>
        <BackLink to={ROUTES.home} label={COPY.nav.backToHome} />
        <div className="track-empty">
          <strong>{isMissing ? COPY.track.notFoundTitle : COPY.track.loadError}</strong>
          {isMissing && <p>{COPY.track.notFoundBody}</p>}
          <Link to={ROUTES.track} className="btn-solid">
            {COPY.track.lookupSubmit}
          </Link>
        </div>
      </section>
    )
  }

  return <OrderDetail order={order} token={token} justPlaced={justPlaced} />
}

function OrderDetail({ order, token, justPlaced }) {
  useDocumentTitle(COPY.track.documentTitle(order.orderNumber))

  const shop = useShop()
  const { isSignedIn } = useAuth()
  const t = COPY.confirmation
  const tt = COPY.track

  const eta = order.isDelivery ? shop.deliveryEta : shop.pickupEta

  return (
    <section className="wrap track-page" aria-label={justPlaced ? t.ariaLabel : tt.ariaLabel}>
      {!justPlaced && <BackLink to={ROUTES.home} label={COPY.nav.backToHome} />}

      <header className={`track-head${justPlaced ? ' is-new' : ''}`}>
        {justPlaced && (
          <span className="track-tick" aria-hidden="true">
            <CheckIcon />
          </span>
        )}
        <h1>{justPlaced ? t.heading : tt.title}</h1>
        {justPlaced && <p className="track-sub">{t.sub(order.customerName)}</p>}
      </header>

      <div className="track-ticket">
        <div className="track-number">
          <span className="track-number-label">{t.orderNumberLabel}</span>
          <strong>#{order.orderNumber}</strong>
          <span className="track-placed">{t.placedAt(formatTime(order.placedAt))}</span>
        </div>

        <ul className="track-facts">
          <Fact icon={<ClockIcon />}>
            {order.isDelivery ? t.etaDelivery(eta) : t.etaPickup(eta)}
          </Fact>
          <Fact icon={<ReceiptIcon />}>
            <span className="track-fact-label">{tt.statusLabel}</span>
            {tt.statuses[order.status] ?? order.status}
          </Fact>
          <Fact icon={<PinIcon />}>
            <span className="track-fact-label">
              {order.isDelivery ? tt.deliveringTo : tt.collectingFrom}
            </span>
            {order.isDelivery ? order.address : shop.address}
          </Fact>
          <Fact icon={<CashIcon />}>
            <span className="track-fact-label">{t.payHeading(order.isDelivery)}</span>
            {t.payAmount(formatPrice(order.total))}
          </Fact>
        </ul>

        {order.notes && (
          <p className="track-notes">
            <span className="track-fact-label">{tt.notesLabel}</span>
            {order.notes}
          </p>
        )}
      </div>

      {justPlaced && <TrackingLink token={token} savedToAccount={isSignedIn} />}

      <div className="panel track-items">
        <h2>{tt.itemsHeading}</h2>

        <ul className="sum-lines">
          {order.items.map((item) => (
            <li key={item.id}>
              <span className="sum-qty">{item.quantity} ×</span>
              <span className="sum-name">
                {item.name} <span className="sum-size">({item.sizeLabel})</span>
                {item.toppings?.length > 0 && (
                  <span className="sum-extras">
                    {COPY.cart.extras(item.toppings.map((x) => x.name))}
                  </span>
                )}
              </span>
              <span className="sum-price">{formatPrice(item.lineTotal)}</span>
            </li>
          ))}
        </ul>

        <div className="cart-row">
          <span>{COPY.cart.subtotal}</span>
          <span>{formatPrice(order.subtotal)}</span>
        </div>
        <div className="cart-row">
          <span>{order.isDelivery ? COPY.cart.deliveryFee : COPY.cart.pickupFee}</span>
          <span>{order.isDelivery ? formatPrice(order.deliveryFee) : COPY.cart.pickupFree}</span>
        </div>
        <div className="cart-row cart-row-total">
          <span>{COPY.cart.total}</span>
          <span>{formatPrice(order.total)}</span>
        </div>

        <p className="track-contact">
          <span className="track-fact-label">{tt.contact}</span>
          {order.customerName} · {order.customerPhone}
        </p>
      </div>

      <p className="track-live-note">{tt.liveNote}</p>

      <Link to={ROUTES.menu} className="btn-ghost full">
        {t.backToMenu}
      </Link>
    </section>
  )
}

/**
 * The token is the only credential a guest has, so this is the one moment it is
 * ever shown. Offer it as a full link rather than a code — a link survives being
 * pasted into WhatsApp, a code has to be typed back in somewhere.
 */
function TrackingLink({ token, savedToAccount }) {
  const t = COPY.confirmation
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}${trackPath(token)}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused; the link stays selectable either way.
    }
  }

  return (
    <div className="panel track-link">
      <h2>{t.trackHeading}</h2>
      <p className="panel-sub">{savedToAccount ? t.trackBodySignedIn : t.trackBody}</p>

      <div className="track-link-row">
        <input
          readOnly
          value={url}
          aria-label={t.trackHeading}
          onFocus={(e) => e.target.select()}
        />
        <button type="button" onClick={copy} className="track-copy">
          <CopyIcon />
          {copied ? t.copied : t.copyLink}
        </button>
      </div>
    </div>
  )
}

function OrderLookup() {
  useDocumentTitle(COPY.track.lookupTitle)

  const navigate = useNavigate()
  const t = COPY.track
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)
  const lastToken = readStored(STORAGE_KEYS.lastOrderToken, '')

  function handleSubmit(event) {
    event.preventDefault()

    const token = tokenFromInput(value)
    if (!token) {
      setError(t.lookupInvalid)
      return
    }

    navigate(trackPath(token))
  }

  return (
    <section className="wrap track-page" aria-label={t.ariaLabel}>
      <BackLink to={ROUTES.home} label={COPY.nav.backToHome} />
      <h1 className="track-lookup-title">{t.lookupTitle}</h1>

      <form className="panel track-lookup" onSubmit={handleSubmit} noValidate>
        <p className="panel-sub">{t.lookupBody}</p>

        <div className="field">
          <label htmlFor="f-token">{t.lookupLabel}</label>
          <div className="field-input">
            <input
              id="f-token"
              value={value}
              placeholder={t.lookupPlaceholder}
              onChange={(e) => {
                setValue(e.target.value)
                setError(null)
              }}
              className={error ? 'err' : ''}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'f-token-error' : undefined}
            />
          </div>
          {error && (
            <span className="errmsg" id="f-token-error">
              {error}
            </span>
          )}
        </div>

        <button type="submit" className="btn-solid full">
          {t.lookupSubmit}
        </button>

        {lastToken && (
          <Link to={trackPath(lastToken)} className="track-last">
            {t.lastOrder}
          </Link>
        )}
      </form>
    </section>
  )
}

function Fact({ icon, children }) {
  return (
    <li className="track-fact">
      <span className="track-fact-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  )
}
