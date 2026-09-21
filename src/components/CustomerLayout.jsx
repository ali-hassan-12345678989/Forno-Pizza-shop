import { Outlet } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'
import MobileNav from './MobileNav'

/** The shopfront chrome. Everything a customer sees sits inside this. */
export default function CustomerLayout() {
  return (
    <>
      <Header />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
      <MobileNav />
    </>
  )
}
