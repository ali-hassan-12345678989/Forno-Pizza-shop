import { Routes, Route } from 'react-router-dom'
import CustomerLayout from './components/CustomerLayout'
import StaffLayout from './components/StaffLayout'
import StaffGate from './components/StaffGate'
import ScrollToTop from './components/ScrollToTop'
import Home from './pages/Home'
import Menu from './pages/Menu'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import Track from './pages/Track'
import Orders from './pages/Orders'
import Placeholder from './pages/Placeholder'
import StaffLogin from './pages/StaffLogin'
import ManagerPanel from './pages/ManagerPanel'
import AdminPanel from './pages/AdminPanel'
import { COPY } from './content/copy'
import { ROUTES } from './config/routes'
import { STAFF_ROLES } from './config/staff'

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

        {/* Staff. The gate asks the database for the caller's role; it is not
            what secures the data — RLS is. See StaffGate. */}
        <Route element={<StaffLayout />}>
          <Route path={ROUTES.staffLogin} element={<StaffLogin />} />
          <Route
            path={ROUTES.manager}
            element={
              <StaffGate requires={STAFF_ROLES.manager}>
                <ManagerPanel />
              </StaffGate>
            }
          />
          <Route
            path={ROUTES.admin}
            element={
              <StaffGate requires={STAFF_ROLES.admin}>
                <AdminPanel />
              </StaffGate>
            }
          />
        </Route>
      </Routes>
    </>
  )
}
