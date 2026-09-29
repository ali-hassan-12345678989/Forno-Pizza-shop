import { useEffect, useState } from 'react'
import { useShop } from '../context/SettingsContext'
import { isShopOpen, formatShopTime } from '../lib/openingHours'
import { COPY } from '../content/copy'
import './ClosedBanner.css'

/** How often the clock is re-read. See the note in the component. */
const TICK_MS = 30_000

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
 * WHY IT WATCHES THE CLOCK. This used to read the time once, during render. A
 * customer with the menu open at 22:58 never saw the banner appear at 23:00 —
 * nothing re-rendered, so nothing re-checked. They would build a cart against a
 * shop that had closed underneath them and be refused at the last step, which
 * is the exact failure the banner exists to prevent.
 *
 * Thirty seconds is chosen against what it costs: no network, no database, one
 * clock read, and a re-render only in the minute the shop actually opens or
 * closes — because the state is stored, so an unchanged answer sets the same
 * value and React does nothing with it.
 */
export default function ClosedBanner() {
  const shop = useShop()
  const [open, setOpen] = useState(() => isShopOpen(shop))

  useEffect(() => {
    // Re-checked immediately as well as on the interval: `shop` changes when
    // the real settings replace the cached copy, and the window may differ.
    setOpen(isShopOpen(shop))

    const timer = setInterval(() => setOpen(isShopOpen(shop)), TICK_MS)
    return () => clearInterval(timer)
  }, [shop])

  if (open) return null

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
