import { useDialog } from '../lib/useDialog'
import './ConfirmDialog.css'

/**
 * "Are you sure?", asked properly.
 *
 * Replaces window.confirm(), which cannot be styled, cannot be read by a screen
 * reader as part of the page, and says nothing about what is at stake. This one
 * names the thing and spells out the consequence.
 *
 * Focus lands on the safe choice. A dialog that opens with the destructive
 * button under the user's finger turns a confirmation into a second chance to
 * make the same mistake.
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const { dialogProps } = useDialog(open, onCancel, { focusSelector: '.confirm-cancel' })

  if (!open) return null

  return (
    <dialog {...dialogProps} className="confirm" aria-labelledby="confirm-title">
      <div className="confirm-panel">
        <h2 id="confirm-title">{title}</h2>
        <p>{body}</p>

        <div className="confirm-acts">
          <button type="button" className="btn-ghost confirm-cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? 'btn-solid confirm-danger' : 'btn-solid'}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
