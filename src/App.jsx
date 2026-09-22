import { Routes, Route } from 'react-router-dom'
import CustomerLayout from './components/CustomerLayout'
import StaffLayout from './components/StaffLayout'
import StaffGate from './components/StaffGate'
import StaffShell from './components/StaffShell'
import ScrollToTop from './components/ScrollToTop'
import Home from './pages/Home'
import Menu from './pages/Menu'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import Track from './pages/Track'
import Orders from './pages/Orders'
import Placeholder from './pages/Placeholder'
import StaffLogin from './pages/StaffLogin'
import ManagerDashboard from './pages/ManagerDashboard'
import ManagerStock from './pages/ManagerStock'
import ManagerSales from './pages/ManagerSales'
import AdminDashboard from './pages/AdminDashboard'
import AdminOrders from './pages/AdminOrders'
import AdminMenuSection from './pages/AdminMenuSection'
import AdminMenuItemPage from './pages/AdminMenuItemPage'
import AdminInventory from './pages/AdminInventory'
import AdminReports from './pages/AdminReports'
import { COPY } from './content/copy'
import { ROUTES } from './config/routes'
import { STAFF_ROLES } from './config/staff'
import { SECTION_IDS, navFor } from './config/staffNav'

/**
 * Which component renders each section.
 *
 * The sidebar, the URLs and this table all read from config/staffNav.js, so a
 * section cannot appear in the navigation without a route behind it, or gain a
 * route nothing links to.
 *
 * A section is either one component, or — where it opens a single record on its
 * own URL — a { list, detail } pair. The record's path fragment lives on the
 * same nav entry as the section's, so no path is spelled in here either.
 */
const PANEL_SECTIONS = {
  [STAFF_ROLES.manager]: {
    [SECTION_IDS.dashboard]: ManagerDashboard,
    [SECTION_IDS.stock]: ManagerStock,
    [SECTION_IDS.sales]: ManagerSales,
  },
  [STAFF_ROLES.admin]: {
    [SECTION_IDS.dashboard]: AdminDashboard,
    [SECTION_IDS.orders]: AdminOrders,
    [SECTION_IDS.menu]: { list: AdminMenuSection, detail: AdminMenuItemPage },
    [SECTION_IDS.inventory]: AdminInventory,
    [SECTION_IDS.reports]: AdminReports,
  },
}

/** Child routes for one panel, in the order the sidebar lists them. */
function sectionRoutes(role) {
  return navFor(role).map((section) => {
    const entry = PANEL_SECTIONS[role][section.id]
    if (!entry) return null

    const List = entry.list ?? entry
    const Detail = section.detail ? entry.detail : null

    if (section.path === '') return <Route key={section.id} index element={<List />} />

    return (
      <Route key={section.id} path={section.path}>
        <Route index element={<List />} />
        {Detail && <Route path={section.detail} element={<Detail />} />}
      </Route>
    )
  })
}

export default function App() {
  return (
    <>
      <a href="#main" className="skip">
        {COPY.common.skipToContent}
      </a>
      <ScrollToTop />
      <Routes>
        <Route element={<CustomerLayout />}>
          <Route path={ROUTES.home} element={<Home />} />
          <Route path={ROUTES.menu} element={<Menu />} />
          <Route path={ROUTES.cart} element={<Cart />} />
          <Route path={ROUTES.checkout} element={<Checkout />} />
          <Route path={ROUTES.track} element={<Track />} />
          <Route path={ROUTES.trackOrder} element={<Track />} />
          <Route path={ROUTES.orders} element={<Orders />} />
          <Route path={ROUTES.notFound} element={<Placeholder />} />
        </Route>

        {/* Staff. The gate asks the database for the caller's role on every
            page view; it is not what secures the data — RLS is. See StaffGate. */}
        <Route element={<StaffLayout />}>
          <Route path={ROUTES.staffLogin} element={<StaffLogin />} />

          <Route
            path={ROUTES.manager}
            element={
              <StaffGate requires={STAFF_ROLES.manager}>
                <StaffShell role={STAFF_ROLES.manager} />
              </StaffGate>
            }
          >
            {sectionRoutes(STAFF_ROLES.manager)}
          </Route>

          <Route
            path={ROUTES.admin}
            element={
              <StaffGate requires={STAFF_ROLES.admin}>
                <StaffShell role={STAFF_ROLES.admin} />
              </StaffGate>
            }
          >
            {sectionRoutes(STAFF_ROLES.admin)}
          </Route>
        </Route>
      </Routes>
    </>
  )
}
