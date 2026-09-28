import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'
import MobileNav from './MobileNav'
import ErrorBoundary from './ErrorBoundary'

/** The shopfront chrome. Everything a customer sees sits inside this. */
export default function CustomerLayout() {
  const { pathname } = useLocation()

  return (
    <>
      <Header />
      <main id="main">
        {/* The boundary sits INSIDE the chrome, not around it. A page that
            throws should cost the customer that page, not the header they
            navigate away with — and the phone number in the header is the one
            thing that still works when everything else has failed.

            Keying on the path resets it on navigation. Without that, React
            keeps the boundary's failed state across routes, so one broken page
            would make every later page look broken too. */}
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <Footer />
      <MobileNav />
    </>
  )
}
