import AuthForm, { AUTH_MODES } from './AuthForm'
import { CloseIcon } from './icons'
import { COPY } from '../content/copy'
import { useShop } from '../context/SettingsContext'
import { useDialog } from '../lib/useDialog'
import './AuthModal.css'

/**
 * A native <dialog>, deliberately.
 *
 * showModal() gives focus trapping, an inert background and Escape-to-close
 * from the platform. A hand-rolled overlay has to reimplement all three, and
 * usually reimplements the first two badly.
 */
export default function AuthModal({ open, initialMode = AUTH_MODES.signIn, onClose }) {
  const shop = useShop()
  const t = COPY.auth
  const { dialogProps } = useDialog(open, onClose, { focusSelector: '#auth-email' })

  if (!open) return null

  return (
    <dialog {...dialogProps} className="authmodal">
      <div className="authmodal-panel">
        <button type="button" className="authmodal-close" onClick={onClose} aria-label={t.close}>
          <CloseIcon />
        </button>

        <p className="authmodal-brand">{shop.name}</p>
        <h2>{initialMode === AUTH_MODES.signUp ? t.signUpTitle : t.signInTitle}</h2>

        <AuthForm initialMode={initialMode} onSuccess={onClose} />

        <div className="authmodal-foot">
          <button type="button" className="authmodal-guest" onClick={onClose}>
            {t.continueAsGuest}
          </button>
          <p className="authmodal-note">{t.neverForced}</p>
        </div>
      </div>
    </dialog>
  )
}
