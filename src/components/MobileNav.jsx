import { NavLink } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { COPY } from '../content/copy'
import { ROUTES } from '../config/routes'
import { HomeIcon, MenuIcon, CartIcon, ClockIcon, ReceiptIcon } from './icons'
import './MobileNav.css'

/**
 * The header's nav links are hidden below 760px, so without this a phone has no
 * way to move between pages at all. A bottom tab bar is what the approved
 * design uses and what thumbs can actually reach.
 */
export default function MobileNav() {
  const { count } = useCart()
  const { isSignedIn } = useAuth()
  const { header } = COPY

  return (
    <nav className="mobnav" aria-label={header.mobileNavLabel}>
      <NavLink to={ROUTES.home} end>
        <HomeIcon />
        {header.nav.home}
      </NavLink>
      <NavLink to={ROUTES.menu}>
        <MenuIcon />
        {header.nav.menu}
      </NavLink>
      <NavLink to={ROUTES.cart}>
        <span className="mobnav-icon-wrap">
          <CartIcon />
          {count > 0 && (
            <span className="mobnav-badge" aria-label={header.cartItemCount(count)}>
              {count}
            </span>
          )}
        </span>
        {header.cart}
      </NavLink>
      {/* Four tabs is the most a thumb can aim at comfortably, so the last one
          is whichever of the two order views actually applies. */}
      {isSignedIn ? (
        <NavLink to={ROUTES.orders}>
          <ReceiptIcon />
          {header.nav.orders}
        </NavLink>
      ) : (
        <NavLink to={ROUTES.track}>
          <ClockIcon />
          {header.nav.track}
        </NavLink>
      )}
    </nav>
  )
}
