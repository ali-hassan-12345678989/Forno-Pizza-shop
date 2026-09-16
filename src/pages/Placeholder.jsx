import { Link } from 'react-router-dom'
import { COPY } from '../content/copy'
import { ROUTES } from '../config/routes'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import './Placeholder.css'

// Stand-in for routes built in later tasks, so header links never dead-end
// while Part 2 is only partly done. Each is replaced by its real page in turn.
export default function Placeholder({ title, task }) {
  useDocumentTitle(title ?? COPY.placeholder.notFoundTitle)

  return (
    <div className="wrap placeholder">
      <h1>{title ?? COPY.placeholder.notFoundTitle}</h1>
      <p>{task ? COPY.placeholder.comingIn(task) : COPY.placeholder.notFoundBody}</p>
      <Link to={ROUTES.home}>{COPY.common.backToHome}</Link>
    </div>
  )
}
