import { useCallback, useEffect, useRef, useState } from 'react'
import { COPY } from '../content/copy'
import { advanceOrder } from '../api/chef'
import { waitingMinutes } from '../lib/waitingMinutes'
import { formatTime } from '../lib/format'
import './ChefOrders.css'

/**
 * The kitchen screen: every open order, oldest first, each with one button.
 *
 * One button, never a menu. A ladder has exactly one next rung, and the
 * database says which — `nextStatus` arrives per order, computed from that
 * order's own flow. A dropdown of every status would offer steps Postgres would
 * refuse and make a busy kitchen read a list to do the obvious thing.
 *
 * Nothing is removed optimistically. The button goes busy, the database answers,
 * and only then does the list change. A kitchen screen that lies about what it
 * has done is worse than one that takes a moment: the whole point is that it
 * agrees with the tracker the customer is watching.
 */
export default function ChefOrders({ orders, onChanged }) {
  const t = COPY.staff.chef

  const [busyId, setBusyId] = useState(null)
  const [failure, setFailure] = useState(null)
  const [announcement, setAnnouncement] = useState('')

  /* The clock has to tick on its own: "waiting 14 min" would otherwise stay at
     14 until something else re-rendered the page, which on a quiet evening is
     never. Once a minute is enough for a figure shown in minutes. */
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(timer)
  }, [])

  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const move = useCallback(
    async (order) => {
      if (busyId) return
      setBusyId(order.id)
      setFailure(null)

      const { result, errorCode } = await advanceOrder(order.id, order.nextStatus)
      if (!alive.current) return

      if (errorCode) {
        setFailure({ id: order.id, code: errorCode })
        setBusyId(null)
        /* Refresh anyway. Every failure here means this screen is showing a
           stage the order has already left — someone else moved it, or the
           customer cancelled — so the honest response is to go and look. */
        await onChanged()
        return
      }

      setAnnouncement(
        t.moved(result.orderNumber, COPY.track.statuses[result.status] ?? result.status),
      )
      await onChanged()
      if (alive.current) setBusyId(null)
    },
    [busyId, onChanged, t],
  )

  return (
    <>
      {/* Politely announced, so a change is heard without interrupting. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {orders.length === 0 && <p className="chef-none">{t.none}</p>}

      {orders.length > 0 && (
        <ul className="chef-list">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              busy={busyId === order.id}
              disabled={Boolean(busyId) && busyId !== order.id}
              failure={failure?.id === order.id ? failure.code : null}
              onMove={move}
            />
          ))}
        </ul>
      )}

      <p className="chef-live">{t.liveNote}</p>
    </>
  )
}

function OrderCard({ order, busy, disabled, failure, onMove }) {
  const t = COPY.staff.chef
  const mins = waitingMinutes(order.placedAt)
  const stage = COPY.track.statuses[order.status] ?? order.status
  const type = COPY.staff.active.types[order.fulfillmentType] ?? order.fulfillmentType

  return (
    <li className={`chef-card${busy ? ' is-busy' : ''}`}>
      <div className="chef-top">
        <span className="chef-num">#{order.orderNumber}</span>
        <span className={`chef-stage ${order.status}`}>{stage}</span>
        <span className="chef-type">{type}</span>
        <span className="chef-wait">{t.waiting(mins)}</span>
      </div>

      <p className="chef-who">
        {order.customerName} · {t.itemCount(order.itemCount)} · {formatTime(order.placedAt)}
      </p>

      <ul className="chef-items">
        {order.items.map((item, index) => (
          // No stable id on a line here: chef_orders() sends what to cook, not
          // row identities, and two identical lines are genuinely identical.
          // eslint-disable-next-line react/no-array-index-key
          <li key={index}>
            <span className="chef-qty">{item.quantity}×</span>
            <span>
              {item.name} · {item.size}
            </span>
            {item.toppings.length > 0 && (
              <span className="chef-extras">{t.extras(item.toppings.join(', '))}</span>
            )}
          </li>
        ))}
      </ul>

      {failure && <p className="chef-fail">{t.errors[failure] ?? t.errors.unknown}</p>}

      <button
        type="button"
        className="chef-go"
        disabled={busy || disabled}
        onClick={() => onMove(order)}
      >
        {t.actions[order.nextStatus] ?? order.nextStatus}
      </button>
    </li>
  )
}
