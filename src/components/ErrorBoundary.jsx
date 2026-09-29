import { Component } from 'react'
import { COPY } from '../content/copy'
import { logDev } from '../lib/logDev'
// The gate's stylesheet, not a copy of it. This is the same moment as the other
// two full-screen states — the app cannot show you the page — so it wears the
// same box rather than introducing a third look for a fourth kind of failure.
import './SettingsGate.css'

/**
 * The last thing standing between a render error and a blank white page.
 *
 * React unmounts the entire tree when a render throws and nothing catches it.
 * Until this existed, every screen in the app failed that way: no message, no
 * retry, no indication anything had happened. On the checkout that costs a real
 * order, and the customer has no idea whether it went through.
 *
 * This has to be a class. `componentDidCatch` and `getDerivedStateFromError`
 * have no hook equivalent — it is the one piece of React that still requires
 * one, which is why this is the only class component in the codebase.
 *
 * `onReset` lets a caller clear whatever state caused the throw. Without it the
 * retry button re-renders the same broken subtree and fails identically, which
 * is worse than no button: it looks like the shop is ignoring you.
 */
/**
 * Did this fail because a code chunk could not be downloaded?
 *
 * The staff panels are split into chunks named by content hash. A customer with
 * the app already open when a deploy lands asks for a hash that no longer
 * exists, and the import rejects. It is the single most likely cause of a real
 * render error in a deployed single-page app.
 *
 * Matched on the message because there is no error type to check: browsers
 * disagree on the wording, so all three forms are listed.
 */
function isStaleChunk(error) {
  const message = String(error?.message ?? '')
  return (
    /dynamically imported module/i.test(message) || // Chrome, Safari
    /Importing a module script failed/i.test(message) || // Firefox
    /ChunkLoadError/i.test(String(error?.name ?? ''))
  )
}

export default class ErrorBoundary extends Component {
  state = { failed: false, stale: false }

  static getDerivedStateFromError(error) {
    return { failed: true, stale: isStaleChunk(error) }
  }

  componentDidCatch(error, info) {
    // Developers get the stack; customers get a sentence. A raw React component
    // stack tells them nothing they can act on, and logDev is compiled out of
    // the production bundle so it never reaches their console either.
    logDev('Render failed:', error, info?.componentStack)
  }

  retry = () => {
    this.props.onReset?.()
    this.setState({ failed: false, stale: false })
  }

  /**
   * A failed chunk cannot be retried in place, and the fourth audit proved it:
   * React stores the rejected `lazy()` promise and re-throws the saved error on
   * the next render without calling the import again. Pressing Retry produced
   * one import attempt, then none, forever.
   *
   * Reloading is the only thing that recovers, because it re-fetches index.html
   * — which is served uncached precisely so it can point at the new hashes.
   */
  reload = () => window.location.reload()

  render() {
    if (!this.state.failed) return this.props.children

    const stale = this.state.stale
    const t = COPY.common

    return (
      <div className="gate">
        <div className="gate-box" role="alert">
          <strong>{stale ? t.staleChunkTitle : t.renderErrorTitle}</strong>
          <p>{stale ? t.staleChunkBody : t.renderErrorBody}</p>
          <button type="button" className="btn-solid" onClick={stale ? this.reload : this.retry}>
            {stale ? t.reloadPage : t.retry}
          </button>
        </div>
      </div>
    )
  }
}
