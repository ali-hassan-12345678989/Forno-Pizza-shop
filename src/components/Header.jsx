import { NavLink, Link } from 'react-router-dom'
import { useShop } from '../context/SettingsContext'
import { COPY } from '../content/copy'
import { ROUTES } from '../config/routes'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import AccountMenu from './AccountMenu'
import { PhoneIcon, CartIcon } from './icons'
import './Header.css'

export default function Header() {
  const { header, brand } = COPY
  const { count } = useCart()
  const { isSignedIn } = useAuth()
  const shop = useShop()

  return (
    <>
      {/* None of Domino's PK, Pizza Hut PK or Cheezious surfaces a phone number
          up top. For a single shop where a call reaches the actual kitchen,
          that's a gap worth taking rather than a convention worth copying. */}
      <div className="utilbar">
        <div className="wrap utilbar-in">
          <span className="utilbar-hours">{shop.hours}</span>
          <a className="utilbar-phone" href={shop.phoneHref}>
            <PhoneIcon />
            {header.phonePrefix} <strong>{shop.phone}</strong>
          </a>
        </div>
      </div>

      <header className="topbar">
        <div className="wrap topbar-in">
          <Link to={ROUTES.home} className="brand" aria-label={brand.homeAriaLabel(shop.name)}>
            {shop.name}
          </Link>

          <nav className="navl" aria-label={header.primaryNavLabel}>
            <NavLink to={ROUTES.home} end>
              {header.nav.home}
            </NavLink>
            <NavLink to={ROUTES.menu}>{header.nav.menu}</NavLink>
            {isSignedIn ? (
              <NavLink to={ROUTES.orders}>{header.nav.orders}</NavLink>
            ) : (
              <NavLink to={ROUTES.track}>{header.nav.track}</NavLink>
            )}
          </nav>

          <span className="spacer" />

          {/* Account sits left of the cart: it is the lower-intent of the two,
              and the cart should stay the last thing in the row on every page. */}
          <AccountMenu />

          <Link
            to={ROUTES.cart}
            className="cart-btn"
            aria-label={count > 0 ? header.cartAriaLabelWithCount(count) : header.cartAriaLabel}
          >
            <CartIcon />
            {header.cart}
            {count > 0 && <span className="cart-count">{count}</span>}
          </Link>

          {/* Adding to the cart happens on another page entirely; without this
              the only feedback is a badge the customer may never look at. */}
          <span className="sr-only" role="status" aria-live="polite">
            {count > 0 ? header.cartAnnouncement(count) : ''}
          </span>
        </div>
      </header>
    </>
  )
}
