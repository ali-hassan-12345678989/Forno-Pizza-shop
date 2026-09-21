import { Outlet } from 'react-router-dom'

/**
 * Staff pages get no shopfront chrome — no header with a cart, no footer, no
 * mobile order bar. A Manager checking stock is not shopping, and the cart
 * button in particular would be actively confusing here.
 */
export default function StaffLayout() {
  return (
    <main id="main">
      <Outlet />
    </main>
  )
}
