import { Link } from 'react-router-dom'
import { ArrowLeftIcon } from './icons'
import './BackLink.css'

/** Explicit destination rather than history.back(), so it behaves the same
    whether the page was reached by a link, a bookmark or a shared URL. */
export default function BackLink({ to, label }) {
  return (
    <Link to={to} className="backlink">
      <ArrowLeftIcon />
      {label}
    </Link>
  )
}
