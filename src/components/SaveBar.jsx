import './SaveBar.css'

/**
 * The one save.
 *
 * Appears only once something has changed, and is the only control on the
 * screen that writes anything — the editor it belongs to has no Save of its
 * own, and neither do the size rows. Three buttons all called Save, each
 * saving a different part of the same item, is the thing this replaces.
 *
 * Sticky rather than fixed, so it sits at the bottom of the panel rather than
 * over the page, and never covers the field being edited on a short screen.
 */
export default function SaveBar({
  visible,
  message,
  saveLabel,
  discardLabel,
  busy = false,
  onSave,
  onDiscard,
}) {
  if (!visible) return null

  return (
    <div className="savebar" role="region" aria-label={message}>
      <p className="savebar-msg">{message}</p>
      <div className="savebar-acts">
        <button type="button" className="btn-ghost" onClick={onDiscard} disabled={busy}>
          {discardLabel}
        </button>
        <button type="button" className="btn-solid" onClick={onSave} disabled={busy}>
          {saveLabel}
        </button>
      </div>
    </div>
  )
}
