import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useOrder } from '../context/OrderContext'
import { useAuth } from '../context/AuthContext'
import BackLink from '../components/BackLink'
import AuthPanel from '../components/AuthPanel'
import CheckoutSteps from '../components/CheckoutSteps'
import { CashIcon } from '../components/icons'
import { COPY } from '../content/copy'
import { ROUTES, trackPath } from '../config/routes'
import { STORAGE_KEYS, writeStored } from '../config/storage'
import { placeOrder, OrderError, fetchSavedDetails } from '../api/orders'
import { logDev } from '../lib/logDev'
import { useShop } from '../context/SettingsContext'
import { formatPrice } from '../lib/format'
import { calculateTotals } from '../lib/totals'
import { validateCheckout, toLocalPhone, MAX_NOTES_LENGTH } from '../lib/validation'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import './Checkout.css'

export default function Checkout() {
  const { lines, count, subtotal, isEmpty, clear } = useCart()
  const { isDelivery, orderType, address, setAddress } = useOrder()
  const { isSignedIn, email, signOut } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState({})
  const [showAuth, setShowAuth] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  // Set the moment the order is accepted, so emptying the cart on the way out
  // cannot flash the "nothing to check out" screen over the top of it.
  const [placed, setPlaced] = useState(false)
  const [prefilled, setPrefilled] = useState(false)
  const formRef = useRef(null)

  // A ref mirroring the fields, so the async prefill below can read what the
  // customer has typed by the time it resolves without re-running on every
  // keystroke — and so it never overwrites them.
  const typed = useRef({ name, phone, address })
  typed.current = { name, phone, address }
  const prefillTried = useRef(false)

  /**
   * "Log in and check out faster" has to mean something. A signed-in customer's
   * last order already holds their name, number and address, and RLS scopes the
   * lookup to them, so this is their own data coming back — never anyone else's.
   */
  useEffect(() => {
    if (!isSignedIn || prefillTried.current) return
    prefillTried.current = true

    let cancelled = false

    fetchSavedDetails().then((saved) => {
      if (cancelled || !saved) return

      let filledSomething = false
      if (!typed.current.name && saved.name) {
        setName(saved.name)
        filledSomething = true
      }
      if (!typed.current.phone && saved.phone) {
        setPhone(toLocalPhone(saved.phone))
        filledSomething = true
      }
      if (isDelivery && !typed.current.address && saved.address) {
        setAddress(saved.address)
        filledSomething = true
      }

      if (filledSomething) setPrefilled(true)
    })

    return () => {
      cancelled = true
    }
  }, [isSignedIn, isDelivery, setAddress])

  function clearPrefill() {
    setName('')
    setPhone('')
    if (isDelivery) setAddress('')
    setPrefilled(false)
    setErrors({})
    formRef.current?.querySelector('#f-name')?.focus()
  }

  const shop = useShop()
  const t = COPY.checkout

  useDocumentTitle(t.title)
  const { deliveryFee, total } = calculateTotals({
    subtotal,
    isDelivery,
    deliveryFee: shop.deliveryFee,
  })

  if (isEmpty && !placed) {
    return (
      <section className="wrap checkout-page" aria-label={t.ariaLabel}>
        <BackLink to={ROUTES.menu} label={COPY.nav.backToMenu} />
        <h1 className="checkout-title">{t.title}</h1>
        <div className="checkout-empty">
          <strong>{t.emptyTitle}</strong>
          <p>{t.emptyBody}</p>
          <Link to={ROUTES.menu} className="btn-solid">
            {COPY.cart.browseMenu}
          </Link>
        </div>
      </section>
    )
  }

  function clearError(field) {
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitting) return

    setSubmitError(null)

    const found = validateCheckout({ name, phone, address, notes }, { requireAddress: isDelivery })
    setErrors(found)

    if (Object.keys(found).length > 0) {
      // Move focus to the first problem so the error is announced, not just seen.
      const firstField = ['name', 'phone', 'address', 'notes'].find((f) => found[f])
      formRef.current?.querySelector(`#f-${firstField}`)?.focus()
      return
    }

    setSubmitting(true)

    try {
      // Only what was ordered and who it is for. Every price is worked out by
      // place_order() from the menu and shop_settings — see api/orders.js.
      const order = await placeOrder(
        { fulfillmentType: orderType, name, phone, address, notes },
        lines,
      )

      setPlaced(true)
      // The one credential a guest has. Remembering it lets /track offer them
      // their order back even if they lose the link.
      writeStored(STORAGE_KEYS.lastOrderToken, order.accessToken)
      clear()

      navigate(trackPath(order.accessToken), { state: { justPlaced: true, order } })
    } catch (error) {
      // Only an OrderError carries a code the customer can act on. Anything
      // else is a bug on our side, and mapping it through the same table would
      // quietly present a TypeError as though it were a rejected order.
      if (error instanceof OrderError) {
        setSubmitError(t.orderErrors[error.code] ?? t.orderErrors.unknown)
      } else {
        logDev('Unexpected failure placing order:', error)
        setSubmitError(t.orderErrors.unknown)
      }
      setSubmitting(false)
    }
  }

  const hasErrors = Object.keys(errors).some((key) => errors[key])

  return (
    <section className="wrap checkout-page" aria-label={t.ariaLabel}>
      <BackLink to={ROUTES.cart} label={COPY.nav.backToCart} />
      <h1 className="checkout-title">{t.title}</h1>
      <CheckoutSteps current="details" />

      <div className="checkout-layout">
        <form ref={formRef} className="checkout-form" onSubmit={handleSubmit} noValidate>
          <div className="panel">
            <h2>{isDelivery ? t.detailsHeading : t.detailsHeadingPickup}</h2>
            <p className="panel-sub">
              {isDelivery
                ? t.detailsSubDelivery(shop.deliveryEta)
                : t.detailsSubPickup(shop.pickupEta, shop.address)}
            </p>

            {isSignedIn ? (
              <p className="acct-line">
                {t.signedInAs} <strong>{email}</strong>
                <button type="button" onClick={signOut}>
                  {t.signOut}
                </button>
              </p>
            ) : (
              <p className="acct-line">
                {t.guestBanner}{' '}
                <button type="button" onClick={() => setShowAuth((v) => !v)}>
                  {t.guestBannerAction}
                </button>{' '}
                {t.guestBannerSuffix}
              </p>
            )}

            {!isSignedIn && showAuth && <AuthPanel onClose={() => setShowAuth(false)} />}

            {prefilled && (
              <p className="prefill-note">
                {t.prefilled}
                <button type="button" onClick={clearPrefill}>
                  {t.prefilledClear}
                </button>
              </p>
            )}

            <div className="two">
              <Field
                id="f-name"
                label={t.nameLabel}
                value={name}
                onChange={(v) => {
                  setName(v)
                  clearError('name')
                }}
                placeholder={t.namePlaceholder}
                autoComplete="name"
                error={errors.name && t.errors[errors.name]}
              />

              <Field
                id="f-phone"
                label={t.phoneLabel}
                value={phone}
                onChange={(v) => {
                  setPhone(v)
                  clearError('phone')
                }}
                placeholder={t.phonePlaceholder}
                autoComplete="tel"
                type="tel"
                inputMode="numeric"
                /* +92 shown as a fixed prefix, leading 0 dropped — how both
                   Domino's PK and Pizza Hut PK take a number. */
                prefix="+92"
                hint={t.phoneHint}
                error={errors.phone && t.errors[errors.phone]}
              />
            </div>

            {isDelivery && (
              <Field
                id="f-address"
                label={t.addressLabel}
                value={address}
                onChange={(v) => {
                  setAddress(v)
                  clearError('address')
                }}
                placeholder={t.addressPlaceholder}
                autoComplete="street-address"
                error={errors.address && t.errors[errors.address]}
              />
            )}

            <Field
              id="f-notes"
              label={isDelivery ? t.notesLabel : t.notesLabelPickup}
              optionalText={t.notesOptional}
              value={notes}
              onChange={(v) => {
                setNotes(v)
                clearError('notes')
              }}
              placeholder={isDelivery ? t.notesPlaceholder : t.notesPlaceholderPickup}
              counter={t.notesCounter(notes.length, MAX_NOTES_LENGTH)}
              error={errors.notes && t.errors[errors.notes]}
            />
          </div>

          {/* One payment method exists, so this states the arrangement rather
              than asking the customer to choose. A radio group of one is a
              decision the customer does not actually have. */}
          <div className="panel pay-panel">
            <h2>{t.paymentHeading}</h2>
            <p className="panel-sub">{t.paymentSub}</p>

            <div className="pay-method">
              <span className="pay-icon" aria-hidden="true">
                <CashIcon />
              </span>
              <span>
                <strong>{t.cashTitle(isDelivery)}</strong>
                <span className="pay-body">{t.cashBody}</span>
              </span>
              <span className="pay-check" aria-hidden="true">
                ✓
              </span>
            </div>

            <p className="pay-amount">
              {isDelivery ? t.payOnDelivery(formatPrice(total)) : t.payOnPickup(formatPrice(total))}
            </p>
          </div>

          {hasErrors && (
            <p className="form-alert" role="alert">
              {t.errors.formInvalid}
            </p>
          )}

          {submitError && (
            <p className="form-alert" role="alert">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            className="btn-solid full checkout-submit"
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? t.placingOrder : t.placeOrder(formatPrice(total))}
          </button>
          <p className="checkout-trust">
            {t.trustNoFees}
            <br />
            {t.cashOnlyNote}
          </p>
        </form>

        <aside className="checkout-summary">
          <h2>{t.summaryTitle}</h2>
          <p className="checkout-count">{COPY.cart.itemsHeading(count)}</p>

          <ul className="sum-lines">
            {lines.map((line) => (
              <li key={line.lineId}>
                <span className="sum-qty">{line.quantity} ×</span>
                <span className="sum-name">
                  {line.name} <span className="sum-size">({line.sizeLabel})</span>
                  {line.toppings?.length > 0 && (
                    <span className="sum-extras">
                      {COPY.cart.extras(line.toppings.map((x) => x.name))}
                    </span>
                  )}
                </span>
                <span className="sum-price">{formatPrice(line.unitPrice * line.quantity)}</span>
              </li>
            ))}
          </ul>

          <div className="cart-row">
            <span>{COPY.cart.subtotal}</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          <div className="cart-row">
            <span>{isDelivery ? COPY.cart.deliveryFee : COPY.cart.pickupFee}</span>
            <span>{isDelivery ? formatPrice(deliveryFee) : COPY.cart.pickupFree}</span>
          </div>
          <div className="cart-row cart-row-total">
            <span>{COPY.cart.total}</span>
            <span>{formatPrice(total)}</span>
          </div>

          <p className="cart-note">{COPY.common.currencyNote}</p>
        </aside>
      </div>
    </section>
  )
}

function Field({
  id,
  label,
  optionalText,
  value,
  onChange,
  placeholder,
  autoComplete,
  type = 'text',
  inputMode,
  prefix,
  hint,
  counter,
  error,
}) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {optionalText && <span className="field-optional">({optionalText})</span>}
        {counter && <span className="field-counter">{counter}</span>}
      </label>

      <div className={`field-input${prefix ? ' has-prefix' : ''}`}>
        {prefix && <span className="field-prefix">{prefix}</span>}
        <input
          id={id}
          type={type}
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          className={error ? 'err' : ''}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </div>

      {error ? (
        <span className="errmsg" id={`${id}-error`}>
          {error}
        </span>
      ) : (
        hint && <span className="field-hint">{hint}</span>
      )}
    </div>
  )
}
