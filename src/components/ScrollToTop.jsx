import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** A router keeps scroll position across navigations, so moving from halfway
    down the menu to the cart would otherwise land mid-page. */
export default function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
