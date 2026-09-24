import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import CustomerLayout from './components/CustomerLayout'
import ScrollToTop from './components/ScrollToTop'
import RouteFallback from './components/RouteFallback'
import Home from './pages/Home'
import Menu from './pages/Menu'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import Track from './pages/Track'
import Orders from './pages/Orders'
import Placeholder from './pages/Placeholder'
import { COPY } from './content/copy'
import { ROUTES } from './config/routes'
import { STAFF_ROLES } from './config/staff'
import { SECTION_IDS, navFor } from './config/staffNav'

/**
 * Every staff screen is loaded on demand, and the customer pages above are not.
 *
 * A customer opening the menu was downloading the Manager, Admin and Chef
 * panels as well — inventory tables, the sales report, the menu editor, the
 * kitchen queue — none of which they can even sign in to. That is most of a
 * single 639 kB bundle spent on code the overwhelming majority of visitors will
 * never run, over mobile data, before the first pizza appears.
 *
 * The shell components go with them. StaffLayout, StaffGate and StaffShell are
 * only ever rendered underneath one of these routes, so leaving them eager
 * would have kept the sidebar, the rail and the role gate in the customer
 * bundle to no purpose.
 *
 * Nothing else may import these modules statically. A single static import
 * anywhere pulls the module back into the main chunk and silently undoes the
 * split for that file — the build does not fail, it just gets big again.
 */
const StaffLayout = lazy(() => import('./components/StaffLayout'))
const StaffGate = lazy(() => import('./components/StaffGate'))
const StaffShell = lazy(() => import('./components/StaffShell'))
const StaffLogin = lazy(() => import('./pages/StaffLogin'))
const ManagerDashboard = lazy(() => import('./pages/ManagerDashboard'))
const ManagerStock = lazy(() => import('./pages/ManagerStock'))
const ManagerSales = lazy(() => import('./pages/ManagerSales'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const AdminOrders = lazy(() => import('./pages/AdminOrders'))
const AdminOrderPage = lazy(() => import('./pages/AdminOrderPage'))
const AdminMenuSection = lazy(() => import('./pages/AdminMenuSection'))
const AdminMenuItemPage = lazy(() => import('./pages/AdminMenuItemPage'))
const AdminInventory = lazy(() => import('./pages/AdminInventory'))
const AdminReports = lazy(() => import('./pages/AdminReports'))
const StaffUsage = lazy(() => import('./pages/StaffUsage'))
const ChefKitchen = lazy(() => import('./pages/ChefKitchen'))

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
  [STAFF_ROLES.chef]: {
    [SECTION_IDS.kitchen]: ChefKitchen,
  },
  [STAFF_ROLES.manager]: {
    [SECTION_IDS.dashboard]: ManagerDashboard,
    [SECTION_IDS.stock]: ManagerStock,
    [SECTION_IDS.usage]: StaffUsage,
    [SECTION_IDS.sales]: ManagerSales,
  },
  [STAFF_ROLES.admin]: {
    [SECTION_IDS.dashboard]: AdminDashboard,
    [SECTION_IDS.orders]: { list: AdminOrders, detail: AdminOrderPage },
    [SECTION_IDS.menu]: { list: AdminMenuSection, detail: AdminMenuItemPage },
    [SECTION_IDS.inventory]: AdminInventory,
    [SECTION_IDS.usage]: StaffUsage,
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
        <Route
          element={
            <Suspense fallback={<RouteFallback />}>
              <StaffLayout />
            </Suspense>
          }
        >
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
            path={ROUTES.chef}
            element={
              <StaffGate requires={STAFF_ROLES.chef}>
                <StaffShell role={STAFF_ROLES.chef} />
              </StaffGate>
            }
          >
            {sectionRoutes(STAFF_ROLES.chef)}
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
