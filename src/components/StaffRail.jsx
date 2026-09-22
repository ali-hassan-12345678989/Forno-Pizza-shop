import { NavLink } from 'react-router-dom'
import { COPY } from '../content/copy'
import { sectionPath } from '../config/routes'
import { StaffIcon } from './StaffIcons'

/**
 * The panel's primary navigation.
 *
 * A sidebar rather than tabs: tabs are a secondary-navigation control and stop
 * working past a handful of items, while a rail keeps every section one click
 * away and tells you where you are without spending vertical space. Sections
 * are real routes, so the browser's back button and a bookmark both behave.
 */
export default function StaffRail({ brand, role, nav, panelRoot, badges, email, onSignOut }) {
  const t = COPY.staff

  return (
    <aside className="staff-rail">
      <div className="staff-rail-brand">
        <b>{brand}</b>
        <span>{role}</span>
      </div>

      <nav className="staff-rail-nav" aria-label={t.nav.sectionsLabel}>
        {nav.map((item) => {
          const count = item.badge ? badges[item.badge] : undefined
          const label = t.nav[item.id]

          return (
            <NavLink
              key={item.id}
              to={sectionPath(panelRoot, item.path)}
              // `end` only on the index route, or the dashboard would stay
              // highlighted on every child path beneath it.
              end={item.path === ''}
              className={({ isActive }) => (isActive ? 'on' : undefined)}
            >
              <span className="staff-rail-ico">
                <StaffIcon name={item.icon} />
              </span>
              <span className="staff-rail-label">{label}</span>
              {count > 0 && (
                // The number is announced once, through the label — a visible
                // count plus a hidden sentence made a screen reader read "2"
                // and then "2 Orders need attention" back to back.
                <span
                  className="staff-rail-badge"
                  role="status"
                  aria-label={t.nav.badgeLabel(count, label)}
                  title={t.nav.badgeLabel(count, label)}
                >
                  {count}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="staff-rail-foot">
        <b>{email}</b>
        <button type="button" onClick={onSignOut}>
          {t.signOut}
        </button>
      </div>
    </aside>
  )
}
