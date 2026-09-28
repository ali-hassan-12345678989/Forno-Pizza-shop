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
export default class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    // Developers get the stack; customers get a sentence. A raw React component
    // stack tells them nothing they can act on, and logDev is compiled out of
    // the production bundle so it never reaches their console either.
    logDev('Render failed:', error, info?.componentStack)
  }

  retry = () => {
    this.props.onReset?.()
    this.setState({ failed: false })
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div className="gate">
        <div className="gate-box" role="alert">
          <strong>{COPY.common.renderErrorTitle}</strong>
          <p>{COPY.common.renderErrorBody}</p>
          <button type="button" className="btn-solid" onClick={this.retry}>
            {COPY.common.retry}
          </button>
        </div>
      </div>
    )
  }
}
