import { useNavigate } from 'react-router-dom'
import { COPY } from '../content/copy'
import { ROUTES } from '../config/routes'
import { useAuth } from '../context/AuthContext'
import './Staff.css'

/**
 * The frame both panels sit in: who you are, and the way out. Shared so the
 * Manager and Admin views cannot drift into looking like two different
 * products, and so signing out behaves identically in both.
 */
export default function StaffShell({ title, subtitle, children }) {
  const t = COPY.staff
  const { email, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate(ROUTES.staffLogin, { replace: true })
  }

  return (
    <div className="staff">
      <header className="staff-head">
        <div>
          <h1>{title}</h1>
          <p className="staff-sub">{subtitle}</p>
        </div>
        <div className="staff-who">
          <span className="staff-email">
            {t.signedInAs} <strong>{email}</strong>
          </span>
          <button type="button" className="btn-ghost" onClick={handleSignOut}>
            {t.signOut}
          </button>
        </div>
      </header>
      <main className="staff-body">{children}</main>
    </div>
  )
}
