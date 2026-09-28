import { Outlet, useLocation } from 'react-router-dom'
import ErrorBoundary from './ErrorBoundary'

/**
 * Staff pages get no shopfront chrome — no header with a cart, no footer, no
 * mobile order bar. A Manager checking stock is not shopping, and the cart
 * button in particular would be actively confusing here.
 */
export default function StaffLayout() {
  const { pathname } = useLocation()

  return (
    <main id="main">
      {/* Separate from the customer boundary on purpose: a panel that throws
          mid-shift must not be able to take the shopfront down with it, and
          these two halves of the app fail for completely different reasons. */}
      <ErrorBoundary key={pathname}>
        <Outlet />
      </ErrorBoundary>
    </main>
  )
}
