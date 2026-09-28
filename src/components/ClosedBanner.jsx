import { useShop } from '../context/SettingsContext'
import { isShopOpen, formatShopTime } from '../lib/openingHours'
import { COPY } from '../content/copy'
import './ClosedBanner.css'

/**
 * Tells a customer the kitchen is shut, before they build a cart.
 *
 * The database refuses the order either way — shop_is_open() and a trigger on
 * the orders table — but being turned away at the last step, after picking
 * toppings and typing an address, is a bad way to find out a shop is closed.
 *
 * It says when the shop opens rather than only that it is shut, because "come
 * back at 12pm" is something a customer can act on and "we are closed" is not.
 *
 * Renders nothing at all when the shop is open, so it costs an open shop no
 * layout and no attention.
 */
export default function ClosedBanner() {
  const shop = useShop()

  if (isShopOpen(shop)) return null

  const t = COPY.common
  // Only offer a time when there is a real window to name. A shop closed by
  // the master switch has no "back at" to give — it reopens when someone says
  // so — and inventing one would be worse than saying nothing.
  const opensAgain = shop.acceptsOrders === false ? null : formatShopTime(shop.opensAt)

  return (
    <div className="closed-banner" role="status">
      <strong>{t.closedTitle}</strong>
      <span>{opensAgain ? t.closedBackAt(opensAgain) : t.closedBody}</span>
    </div>
  )
}
