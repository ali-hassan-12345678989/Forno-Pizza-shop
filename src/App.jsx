import { Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import MobileNav from './components/MobileNav'
import ScrollToTop from './components/ScrollToTop'
import Home from './pages/Home'
import Menu from './pages/Menu'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import Track from './pages/Track'
import Orders from './pages/Orders'
import Placeholder from './pages/Placeholder'
import { COPY } from './content/copy'
import { ROUTES } from './config/routes'

export default function App() {
  return (
    <>
      <a href="#main" className="skip">
        {COPY.common.skipToContent}
      </a>
      <ScrollToTop />
      <Header />
      <main id="main">
        <Routes>
          <Route path={ROUTES.home} element={<Home />} />
          <Route path={ROUTES.menu} element={<Menu />} />
          <Route path={ROUTES.cart} element={<Cart />} />
          <Route path={ROUTES.checkout} element={<Checkout />} />
          <Route path={ROUTES.track} element={<Track />} />
          <Route path={ROUTES.trackOrder} element={<Track />} />
          <Route path={ROUTES.orders} element={<Orders />} />
          <Route path={ROUTES.notFound} element={<Placeholder />} />
        </Routes>
      </main>
      <Footer />
      <MobileNav />
    </>
  )
}
