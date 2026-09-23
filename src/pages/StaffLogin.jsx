import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { COPY } from '../content/copy'
import { ROUTES } from '../config/routes'
import { STAFF_ROLES } from '../config/staff'
import { useAuth } from '../context/AuthContext'
import { useStaff } from '../context/StaffContext'
import { validateEmail } from '../lib/validation'
import { LockIcon, MailIcon } from '../components/icons'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import '../components/Staff.css'

/** Where each role lands once the database has confirmed who they are. */
const HOME_FOR_ROLE = {
  [STAFF_ROLES.manager]: ROUTES.manager,
  [STAFF_ROLES.admin]: ROUTES.admin,
  [STAFF_ROLES.chef]: ROUTES.chef,
}

/**
 * FR-6.1 and FR-7.1: a sign-in of its own, away from the customer one.
 *
 * It is the same Supabase Auth underneath — two auth systems for two accounts
 * would be exactly the over-engineering the PRD rules out. What makes it
 * "separate" is that the accounts are separate, and that reaching a panel
 * depends on a role the database holds, not on having signed in here.
 */
export default function StaffLogin() {
  const t = COPY.staff
  const { signIn, isSignedIn } = useAuth()
  const { role, ready } = useStaff()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [busy, setBusy] = useState(false)

  useDocumentTitle(t.documentTitle)

  // Already staff: go where they were going. Waiting for `ready` matters —
  // redirecting on a role that has not loaded yet would bounce them to the
  // refusal screen for a frame.
  if (isSignedIn && ready && role && HOME_FOR_ROLE[role]) {
    return <Navigate to={HOME_FOR_ROLE[role]} replace />
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return

    const next = {}
    const emailError = validateEmail(email)
    if (emailError) next.email = emailError
    if (!password) next.password = 'passwordRequired'

    setErrors(next)
    setServerError(null)
    if (Object.keys(next).length > 0) return

    setBusy(true)
    const message = await signIn(email, password)
    setBusy(false)

    // Supabase distinguishes "no such user" from "wrong password"; we do not.
    // Either way an attacker learns nothing about which addresses are staff.
    if (message) setServerError(t.errors.signInFailed)
  }

  return (
    <div className="staff-gate">
      <form className="staff-login panel" onSubmit={submit} noValidate>
        <h1>{t.loginTitle}</h1>
        <p className="panel-sub">{t.loginSub}</p>

        <div className="field">
          <label htmlFor="staff-email">{t.email}</label>
          <div className="field-input has-lead">
            <span className="field-lead" aria-hidden="true">
              <MailIcon />
            </span>
            <input
              id="staff-email"
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
              aria-describedby={errors.email ? 'staff-email-error' : undefined}
            />
          </div>
          {errors.email && (
            <span className="errmsg" id="staff-email-error">
              {t.errors[errors.email]}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="staff-password">{t.password}</label>
          <div className="field-input has-lead">
            <span className="field-lead" aria-hidden="true">
              <LockIcon />
            </span>
            <input
              id="staff-password"
              type="password"
              autoComplete="current-password"
              placeholder={t.passwordPlaceholder}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setErrors((prev) => ({ ...prev, password: undefined }))
              }}
              className={errors.password ? 'err' : ''}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'staff-password-error' : undefined}
            />
          </div>
          {errors.password && (
            <span className="errmsg" id="staff-password-error">
              {t.errors[errors.password]}
            </span>
          )}
        </div>

        {serverError && (
          <p className="form-alert" role="alert">
            {serverError}
          </p>
        )}

        <button type="submit" className="btn-solid staff-submit" disabled={busy}>
          {busy ? t.busy : t.submit}
        </button>
      </form>
    </div>
  )
}
