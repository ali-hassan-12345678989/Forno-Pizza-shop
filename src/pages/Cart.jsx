import { Link, useNavigate } from 'react-router-dom'
import { useCart, MAX_QUANTITY } from '../context/CartContext'
import { useOrder } from '../context/OrderContext'
import BackLink from '../components/BackLink'
import { COPY } from '../content/copy'
import { sizedImage } from '../content/images'
import { ROUTES } from '../config/routes'
import { useShop } from '../context/SettingsContext'
import { formatPrice } from '../lib/format'
import { calculateTotals } from '../lib/totals'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import './Cart.css'

export default function Cart() {
  useDocumentTitle(COPY.cart.title)

  const { lines, count, subtotal, isEmpty, setQuantity, removeLine } = useCart()
  const { isDelivery, address } = useOrder()
  const navigate = useNavigate()
  const shop = useShop()
  const t = COPY.cart

  const { deliveryFee, total } = calculateTotals({
    subtotal,
    isDelivery,
    deliveryFee: shop.deliveryFee,
  })

  if (isEmpty) {
    return (
      <section className="wrap cart-page" aria-label={t.ariaLabel}>
        <BackLink to={ROUTES.menu} label={COPY.nav.backToMenu} />
        <h1 className="cart-title">{t.title}</h1>
        <div className="cart-empty">
          <strong>{t.emptyTitle}</strong>
          <p>{t.emptyBody}</p>
          <Link to={ROUTES.menu} className="btn-solid">
            {t.browseMenu}
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="wrap cart-page" aria-label={t.ariaLabel}>
      <h1 className="cart-title">{t.title}</h1>
      <p className="cart-sub">{t.itemsHeading(count)}</p>

      <div className="cart-layout">
        <ul className="cart-lines">
          {lines.map((line) => (
            <li key={line.lineId} className="cart-line">
              {line.imageUrl && (
                <img
                  className="cart-thumb"
                  src={sizedImage(line.imageUrl, { width: 160, quality: 65 })}
                  alt={line.name}
                  loading="lazy"
                />
              )}

              <div className="cart-line-main">
                <div className="cart-line-name">
                  {line.name}
                  <span className="cart-line-size">{line.sizeLabel}</span>
                </div>
                {line.toppings?.length > 0 && (
                  <div className="cart-line-extras">
                    {t.extras(line.toppings.map((x) => x.name))}
                  </div>
                )}
                <div className="cart-line-unit">{t.unitEach(formatPrice(line.unitPrice))}</div>
              </div>

              <div className="qty" role="group" aria-label={t.quantityLabel(line.name)}>
                <button
                  type="button"
                  onClick={() => setQuantity(line.lineId, line.quantity - 1)}
                  aria-label={t.decrease}
                >
                  −
                </button>
                <span className="qty-value">{line.quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(line.lineId, line.quantity + 1)}
                  disabled={line.quantity >= MAX_QUANTITY}
                  aria-label={t.increase}
                >
                  +
                </button>
              </div>

              {/* A disabled + button with no reason next to it reads as broken. */}
              {line.quantity >= MAX_QUANTITY && (
                <p className="cart-max">{t.maxReached(MAX_QUANTITY)}</p>
              )}

              <div className="cart-line-total">{formatPrice(line.unitPrice * line.quantity)}</div>

              <button
                type="button"
                className="cart-remove"
                onClick={() => removeLine(line.lineId)}
                aria-label={t.removeLabel(line.name)}
              >
                {t.remove}
              </button>
            </li>
          ))}
        </ul>

        <aside className="cart-summary">
          <h2>{t.summaryTitle}</h2>

          <div className="cart-dest">
            <span className="cart-dest-label">
              {isDelivery ? t.deliveringTo : t.collectingFrom}
            </span>
            <span className="cart-dest-value">
              {isDelivery ? address || t.noAddressYet : shop.address}
            </span>
            <Link to={ROUTES.home} className="cart-dest-change">
              {t.changeOrderType}
            </Link>
          </div>

          <div className="cart-row">
            <span>{t.subtotal}</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          <div className="cart-row">
            <span>{isDelivery ? t.deliveryFee : t.pickupFee}</span>
            <span>{isDelivery ? formatPrice(deliveryFee) : t.pickupFree}</span>
          </div>
          <div className="cart-row cart-row-total">
            <span>{t.total}</span>
            <span>{formatPrice(total)}</span>
          </div>

          <button
            type="button"
            className="btn-solid full"
            onClick={() => navigate(ROUTES.checkout)}
          >
            {t.checkout}
          </button>
          <Link to={ROUTES.menu} className="cart-keep">
            {t.keepShopping}
          </Link>
          <p className="cart-note">{COPY.common.currencyNote}</p>
        </aside>
      </div>
    </section>
  )
}
