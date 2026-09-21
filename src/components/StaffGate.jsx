import { Link, Navigate } from 'react-router-dom'
import { COPY } from '../content/copy'
import { ROUTES } from '../config/routes'
import { useAuth } from '../context/AuthContext'
import { useStaff } from '../context/StaffContext'
import './Staff.css'

/**
 * Stands in front of a staff page and asks the database who the caller is.
 *
 * This gate is a courtesy, not a security boundary. Anyone can edit React state
 * in a browser, so the only thing that actually keeps a customer out of the
 * Manager's data is the RLS on the tables these pages read. What this does is
 * stop a signed-in customer from seeing a broken screen full of failed
 * requests, and make the refusal legible.
 *
 * `requires` is a value from STAFF_ROLES, so a typo is a missing import rather
 * than a page that silently admits everyone.
 */
export default function StaffGate({ requires, children }) {
  const { isSignedIn, ready: authReady } = useAuth()
  const { role, ready } = useStaff()
  const t = COPY.staff

  if (!authReady || !ready) {
    return (
      <div className="staff-gate" aria-busy="true">
        <span className="staff-spinner" aria-hidden="true" />
        <span>{t.checking}</span>
      </div>
    )
  }

  // No session at all: send them to the staff sign-in rather than showing a
  // refusal, because signing in is the thing they need to do.
  if (!isSignedIn) return <Navigate to={ROUTES.staffLogin} replace />

  // Signed in, wrong role. Same wording whether they are a customer or the
  // other member of staff — confirming which panel exists at this address, and
  // that they merely hold the wrong role, tells them more than they need.
  if (role !== requires) {
    return (
      <div className="staff-gate">
        <div className="staff-deny">
          <h1>{t.notAuthorisedTitle}</h1>
          <p>{t.notAuthorisedBody}</p>
          <Link className="btn-ghost" to={ROUTES.home}>
            {t.backToShop}
          </Link>
        </div>
      </div>
    )
  }

  return children
}
