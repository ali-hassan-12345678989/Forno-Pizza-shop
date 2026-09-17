import { useCallback, useState } from 'react'
import { COPY } from '../content/copy'
import { ORDER_STATUS } from '../config/orderStatus'
import { useShop } from '../context/SettingsContext'
import { useDialog } from '../lib/useDialog'
import { cancelOrder } from '../api/orders'
import './CancelOrder.css'

/**
 * FR-3.3: calling an order off, while that is still possible.
 *
 * The button only appears while the order is waiting to be started, but that is
 * a display decision — cancel_order() is what actually enforces the window, and
 * it re-checks under a row lock. The gap between the two is real and reachable:
 * the kitchen can press "preparing" while this confirmation is open, and the
 * customer is then told so rather than being left with a button that silently
 * did nothing.
 */
export default function CancelOrder({ order, token, onCancelled }) {
  const t = COPY.track.cancel
  const shop = useShop()

  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const close = useCallback(() => {
    if (!busy) setConfirming(false)
  }, [busy])

  // Focus lands on "Keep my order". showModal() would otherwise put it on the
  // first focusable element, and a keyboard user should not open a destructive
  // confirmation already standing on the destructive answer.
  const { dialogProps } = useDialog(confirming, close, { focusSelector: '.cancelorder-keep' })

  if (order.status !== ORDER_STATUS.placed) return null

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      onCancelled(await cancelOrder(token))
      setConfirming(false)
    } catch (thrown) {
      setError(t.errors[thrown.code] ?? t.errors.unknown)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="cancelorder">
      <button type="button" className="cancelorder-open" onClick={() => setConfirming(true)}>
        {t.action}
      </button>
      <p className="cancelorder-note">{t.note}</p>

      {confirming && (
        <dialog {...dialogProps} className="cancelorder-dialog">
          <div className="cancelorder-panel">
            <h2>{t.confirmTitle(order.orderNumber)}</h2>
            <p className="cancelorder-body">{t.confirmBody}</p>

            {error && (
              <div className="cancelorder-error" role="alert">
                <strong>{error}</strong>
                <a href={shop.phoneHref}>{t.callInstead(shop.phone)}</a>
              </div>
            )}

            <div className="cancelorder-actions">
              {/* The safe answer first, and as the solid button: the one that
                  looks like the primary action should be the one that does
                  nothing irreversible. */}
              <button
                type="button"
                className="btn-solid cancelorder-keep"
                onClick={close}
                disabled={busy}
              >
                {t.confirmKeep}
              </button>
              <button
                type="button"
                className="cancelorder-confirm"
                onClick={confirm}
                disabled={busy}
              >
                {busy ? t.working : t.confirmCancel}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  )
}
