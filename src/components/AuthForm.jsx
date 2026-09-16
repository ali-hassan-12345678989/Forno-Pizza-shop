import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { COPY } from '../content/copy'
import { validateEmail, validatePassword } from '../lib/validation'
import { MailIcon, LockIcon, EyeIcon, EyeOffIcon } from './icons'
import './AuthForm.css'

export const AUTH_MODES = { signIn: 'signIn', signUp: 'signUp' }

/**
 * The account form itself, with no opinion about where it sits. The header
 * opens it in a dialog, checkout and the orders page render it inline — one
 * implementation, so the rules and the wording cannot drift apart between them.
 *
 * Deliberately NOT a <form> element. At checkout this renders inside the
 * checkout form, and a nested <form> is invalid HTML with undefined behaviour —
 * browsers disagree about which form an inner control belongs to, so Enter in
 * the password box could plausibly place an order. Owning the Enter key here
 * makes that unreachable, and makes Enter actually log you in, which it did not
 * do while the two forms were fighting over the keystroke.
 */
export default function AuthForm({ initialMode = AUTH_MODES.signIn, onSuccess }) {
  const { signIn, signUp } = useAuth()
  const t = COPY.auth

  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [busy, setBusy] = useState(false)

  const isSignUp = mode === AUTH_MODES.signUp

  function switchTo(next) {
    setMode(next)
    // Carry the email over — retyping it because you picked the wrong tab is a
    // small insult, and the two forms want the same value anyway.
    setErrors({})
    setServerError(null)
  }

  async function submit() {
    if (busy) return

    const next = {}
    const emailError = validateEmail(email)
    const passwordError = validatePassword(password)
    if (emailError) next.email = emailError
    if (passwordError) next.password = passwordError

    setErrors(next)
    setServerError(null)
    if (Object.keys(next).length > 0) return

    setBusy(true)
    const message = isSignUp ? await signUp(email, password) : await signIn(email, password)
    setBusy(false)

    if (message) setServerError(message)
    else onSuccess?.()
  }

  function handleKeyDown(event) {
    if (event.key !== 'Enter') return
    // Stops here: never reaches an enclosing form.
    event.preventDefault()
    event.stopPropagation()
    submit()
  }

  return (
    <div className="authform" onKeyDown={handleKeyDown}>
      {/* A two-way segmented control, not a sentence-long link. Both routes are
          equally valid here, so neither should be buried under the other. */}
      <div className="authform-modes" role="tablist" aria-label={t.modeLabel}>
        <button
          type="button"
          role="tab"
          aria-selected={!isSignUp}
          className={!isSignUp ? 'on' : ''}
          onClick={() => switchTo(AUTH_MODES.signIn)}
        >
          {t.logIn}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isSignUp}
          className={isSignUp ? 'on' : ''}
          onClick={() => switchTo(AUTH_MODES.signUp)}
        >
          {t.signUp}
        </button>
      </div>

      <p className="authform-sub">{isSignUp ? t.signUpSub : t.signInSub}</p>

      <div className="field">
        <label htmlFor="auth-email">{t.email}</label>
        <div className="field-input has-lead">
          <span className="field-lead" aria-hidden="true">
            <MailIcon />
          </span>
          <input
            id="auth-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t.emailPlaceholder}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setErrors((prev) => ({ ...prev, email: undefined }))
            }}
            className={errors.email ? 'err' : ''}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'auth-email-error' : undefined}
          />
        </div>
        {errors.email && (
          <span className="errmsg" id="auth-email-error">
            {t.errors[errors.email]}
          </span>
        )}
      </div>

      <div className="field">
        <label htmlFor="auth-password">{t.password}</label>
        <div className="field-input has-lead">
          <span className="field-lead" aria-hidden="true">
            <LockIcon />
          </span>
          <input
            id="auth-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            placeholder={t.passwordPlaceholder}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setErrors((prev) => ({ ...prev, password: undefined }))
            }}
            className={errors.password ? 'err' : ''}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'auth-password-error' : undefined}
          />
          {/* Typing a password blind on a phone keyboard is how people end up
              locked out of an account they just created. */}
          <button
            type="button"
            className="field-trail"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t.hidePassword : t.showPassword}
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {errors.password ? (
          <span className="errmsg" id="auth-password-error">
            {t.errors[errors.password]}
          </span>
        ) : (
          isSignUp && <span className="field-hint">{t.passwordHint}</span>
        )}
      </div>

      {serverError && (
        <p className="authform-server" role="alert">
          {serverError}
        </p>
      )}

      <button
        type="button"
        className="btn-solid full"
        onClick={submit}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? t.busy : isSignUp ? t.submitSignUp : t.submitSignIn}
      </button>
    </div>
  )
}
