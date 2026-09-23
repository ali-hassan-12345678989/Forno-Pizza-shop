import { Outlet, useNavigate } from 'react-router-dom'
import StaffRail from './StaffRail'
import { COPY } from '../content/copy'
import { ROUTES } from '../config/routes'
import { STAFF_ROLES } from '../config/staff'
import { PANEL_ROOT, navFor } from '../config/staffNav'
import { useAuth } from '../context/AuthContext'
import { useShop } from '../context/SettingsContext'
import { useStaffBadges } from '../lib/useStaffBadges'
import './Staff.css'

/** The panel's own name, by role. */
const PANEL_TITLE = {
  [STAFF_ROLES.manager]: 'managerTitle',
  [STAFF_ROLES.admin]: 'adminTitle',
  [STAFF_ROLES.chef]: 'chefTitle',
}

/**
 * The frame both panels sit in: a fixed sidebar and the section beside it.
 *
 * Shared so the Manager and Admin views cannot drift into looking like two
 * different products, and so signing out behaves identically in both. Each
 * section renders through the Outlet — every entry in the sidebar is a real
 * route, so the back button, a refresh and a bookmark all behave the way a
 * person expects them to.
 *
 * The shop's name comes from shop_settings like everywhere else on the site,
 * rather than being typed into the staff copy as a second source of truth.
 */
export default function StaffShell({ role }) {
  const t = COPY.staff
  const shop = useShop()
  const { email, signOut } = useAuth()
  const navigate = useNavigate()

  const nav = navFor(role)
  const panelRoot = PANEL_ROOT[role]
  const { counts } = useStaffBadges(nav)

  async function handleSignOut() {
    await signOut()
    navigate(ROUTES.staffLogin, { replace: true })
  }

  return (
    <div className="staff">
      <StaffRail
        brand={shop.name}
        role={t[PANEL_TITLE[role]]}
        nav={nav}
        panelRoot={panelRoot}
        badges={counts}
        email={email}
        onSignOut={handleSignOut}
      />
      <div className="staff-main">
        <Outlet />
      </div>
    </div>
  )
}
