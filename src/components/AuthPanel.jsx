import AuthForm from './AuthForm'
import { COPY } from '../content/copy'
import './AuthPanel.css'

/**
 * AuthForm rendered in place rather than over the page — used at checkout,
 * where opening a modal mid-order would bury the cart behind a backdrop, and on
 * the orders page, where signing in IS the page.
 *
 * onClose is optional. At checkout it dismisses the panel and carries on as a
 * guest; on the orders page there is nothing to carry on to, so the escape
 * hatch is left out rather than offered as a dead end.
 */
export default function AuthPanel({ onClose }) {
  const t = COPY.auth

  return (
    <div className="authpanel">
      <AuthForm onSuccess={onClose} />

      {onClose && (
        <button type="button" className="authpanel-ghost" onClick={onClose}>
          {t.continueAsGuest}
        </button>
      )}

      <p className="authpanel-note">{t.neverForced}</p>
    </div>
  )
}
