import { useCallback, useEffect, useRef } from 'react'

/**
 * Drives a native <dialog> from React state.
 *
 * showModal() is what brings focus trapping, an inert background and
 * Escape-to-close from the platform, but it has to be called imperatively — so
 * every dialog needs the same three pieces of plumbing: an effect that opens
 * and closes it, a `cancel` handler so Escape goes through React rather than
 * around it, and a click handler that treats a hit on the dialog element itself
 * as a backdrop click. Written once here rather than copied into each one.
 *
 * @param open          whether the dialog should be showing
 * @param onClose       called when the platform or the backdrop dismisses it
 * @param focusSelector optional element inside to focus on open. showModal()
 *                      otherwise parks focus on the first focusable thing,
 *                      which is usually the close button — so a keyboard user
 *                      opens a form and lands on "Close".
 */
export function useDialog(open, onClose, { focusSelector } = {}) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
      if (focusSelector) dialog.querySelector(focusSelector)?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open, focusSelector])

  // Escape fires `cancel` before closing; let React own the open state either way.
  const onCancel = useCallback(
    (event) => {
      event.preventDefault()
      onClose()
    },
    [onClose],
  )

  // A click landing on the dialog itself came from the backdrop — the panel
  // inside stops anything aimed at it.
  const onClick = useCallback(
    (event) => {
      if (event.target === ref.current) onClose()
    },
    [onClose],
  )

  return { ref, dialogProps: { ref, onCancel, onClick } }
}
