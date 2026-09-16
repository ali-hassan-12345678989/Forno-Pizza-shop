import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrder } from '../context/OrderContext'
import { useAuth } from '../context/AuthContext'
import { ORDER_TYPES } from '../config/fulfillment'
import { useShop } from '../context/SettingsContext'
import { COPY } from '../content/copy'
import { IMAGES } from '../content/images'
import { ROUTES } from '../config/routes'
import { CheckIcon, CashIcon, ClockIcon } from '../components/icons'
import AuthModal from '../components/AuthModal'
import { AUTH_MODES } from '../components/AuthForm'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import './Home.css'

export default function Home() {
  const { setOrderType, address, setAddress, isDelivery } = useOrder()
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()
  const shop = useShop()
  const [authMode, setAuthMode] = useState(null)
  const t = COPY.home

  useDocumentTitle(null)

  const startOrder = () => navigate(ROUTES.menu)

  return (
    <>
      <section className="hero wrap" aria-label={t.heroAriaLabel}>
        <div className="hero-copy">
          <h1>
            {t.heroHeadingLine1}
            <br />
            {t.heroHeadingLine2}
          </h1>
          <p className="lede">{t.lede}</p>

          {/* Delivery/pickup sits in one pinned control rather than tabs buried
              in the menu, which is what all three PK chains converge on. */}
          <div className="modepick" role="group" aria-label={t.orderTypeLabel}>
            <button
              type="button"
              className={isDelivery ? 'on' : ''}
              onClick={() => setOrderType(ORDER_TYPES.delivery)}
              aria-pressed={isDelivery}
            >
              {t.delivery}
            </button>
            <button
              type="button"
              className={!isDelivery ? 'on' : ''}
              onClick={() => setOrderType(ORDER_TYPES.pickup)}
              aria-pressed={!isDelivery}
            >
              {t.pickup}
            </button>
          </div>

          {isDelivery ? (
            <div className="addrrow">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t.addressPlaceholder}
                aria-label={t.addressAriaLabel}
                autoComplete="street-address"
              />
              <button type="button" className="btn-red" onClick={startOrder}>
                {COPY.common.startOrder}
              </button>
            </div>
          ) : (
            <div className="pickup-box">
              <div>
                <span className="pickup-label">{t.collectFrom}</span>
                <strong>{shop.address}</strong>
              </div>
              <button type="button" className="btn-red" onClick={startOrder}>
                {COPY.common.startOrder}
              </button>
            </div>
          )}

          <p className="eta">
            <span className="dot" />
            {isDelivery ? t.deliveryEta(shop.deliveryEta) : t.pickupEta(shop.pickupEta)}
            <span className="eta-sep">·</span>
            {t.cashOn(isDelivery)}
          </p>

          {/* Cheezious refuses to render its menu at all until you set a
              location. We capture the address but never gate browsing on it. */}
          {isDelivery && <p className="microcopy">{t.addressLater}</p>}

          {/* Offered below the order controls, and only to people who are not
              already signed in — there is nothing here for them to do. */}
          {!isSignedIn && (
            <p className="hero-auth">
              {t.authReturning}{' '}
              <button type="button" onClick={() => setAuthMode(AUTH_MODES.signIn)}>
                {COPY.auth.logIn}
              </button>
              <span className="hero-auth-sep">{t.authSeparator}</span>
              {t.authNew}{' '}
              <button type="button" onClick={() => setAuthMode(AUTH_MODES.signUp)}>
                {COPY.auth.signUp}
              </button>
            </p>
          )}

          <AuthModal
            open={authMode !== null}
            initialMode={authMode ?? AUTH_MODES.signIn}
            onClose={() => setAuthMode(null)}
          />
        </div>

        <div className="heroimg">
          <img
            src={IMAGES.hero}
            alt={t.heroImageAlt}
            width="900"
            height="900"
            fetchPriority="high"
          />
        </div>
      </section>

      <section className="wrap" aria-label={t.trustAriaLabel}>
        <ul className="trust">
          <li>
            <CheckIcon />
            <div>
              <strong>{t.trust.noAccountTitle}</strong>
              <span>{t.trust.noAccountBody}</span>
            </div>
          </li>
          <li>
            <CashIcon />
            <div>
              <strong>{t.trust.cashTitle(isDelivery)}</strong>
              <span>{t.trust.cashBody}</span>
            </div>
          </li>
          <li>
            <ClockIcon />
            <div>
              <strong>{t.trust.trackTitle}</strong>
              <span>{t.trust.trackBody}</span>
            </div>
          </li>
        </ul>
      </section>

      <section className="wrap steps-sec" aria-label={t.stepsAriaLabel}>
        <h2>{t.stepsHeading}</h2>
        <ol className="steps">
          {t.steps.map((step, i) => (
            <li key={step.title}>
              <span className="step-n">{i + 1}</span>
              <strong>{step.title}</strong>
              <span>{step.body}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}
