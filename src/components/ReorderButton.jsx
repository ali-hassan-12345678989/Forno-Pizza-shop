import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { buildReorderPlan } from '../lib/reorder'
import { COPY } from '../content/copy'
import { ROUTES } from '../config/routes'
import './ReorderButton.css'

/**
 * Puts a past order back in the cart.
 *
 * Every line is looked up again in today's menu rather than copied forward, so
 * what lands in the cart is today's dish at today's price — see lib/reorder.js.
 *
 * TWO OUTCOMES, ON PURPOSE.
 *
 * When everything is still available this goes straight to the cart, because
 * that is the whole point: a regular should be two taps from the same order
 * they had last time.
 *
 * When something is missing it stops and says what, in place, instead of
 * navigating. Landing on a cart that is quietly one item shorter than the
 * order it came from is how a customer ends up ringing the shop to ask what
 * happened — and a message shown on the page you are leaving is a message
 * nobody reads.
 *
 * The button is a sibling of the row's link rather than inside it. The whole
 * card is an anchor to the tracking page, and a button nested in an anchor is
 * neither valid HTML nor reliably operable from a keyboard.
 */
export default function ReorderButton({ order, menu }) {
  const cart = useCart()
  const navigate = useNavigate()
  const [notice, setNotice] = useState(null)
  const t = COPY.orders

  // Nothing to decide on until the menu is in hand. Rendering the button early
  // and having it do nothing on the first click would be worse than waiting.
  if (!menu) return null

  const plan = buildReorderPlan(order, menu)

  if (plan.lines.length === 0) {
    return (
      <p className="reorder-note is-none">
        {t.reorderNothing} <Link to={ROUTES.menu}>{t.browseMenu}</Link>
      </p>
    )
  }

  const add = () => {
    for (const line of plan.lines) {
      cart.addLine(line.item, line.size, line.toppings, line.quantity)
    }

    const missing = [...plan.unavailable, ...plan.droppedToppings]

    if (missing.length === 0) {
      navigate(ROUTES.cart)
      return
    }

    setNotice({ added: plan.lines.length, missing })
  }

  if (notice) {
    return (
      <p className="reorder-note" role="status">
        {t.reorderPartial(notice.added, notice.missing)}{' '}
        <Link to={ROUTES.cart}>{t.reorderGoToCart}</Link>
      </p>
    )
  }

  return (
    <button type="button" className="btn-ghost reorder-btn" onClick={add}>
      {t.reorder}
    </button>
  )
}
