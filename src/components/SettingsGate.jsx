import { useSettingsStatus, useSettingsAreFresh } from '../context/SettingsContext'
import { COPY } from '../content/copy'
import './SettingsGate.css'

/**
 * Holds a screen back until the shop's details are known.
 *
 * TWO STRENGTHS, because two questions have different answers.
 *
 * The default is "do we have details at all". A returning customer has last
 * visit's copy in hand before the first request goes out, so this passes
 * immediately and they see the whole shopfront instead of a spinner — the home
 * page's headline used to appear at 790ms, and it is static copy that reads
 * nothing from here. A first-time visitor has nothing cached and waits exactly
 * as they did before.
 *
 * `requireFresh` is the stronger one, and it is for money. The cart and the
 * checkout show a delivery fee and a total, and quoting a figure from a cache
 * that the kitchen then disagrees with is its own kind of wrong — even though
 * place_order() recomputes every total server-side and so cannot be tricked by
 * it. Those two screens wait for the database. In practice they never wait at
 * all: nobody reaches a cart without passing the menu first, by which time the
 * answer has long since arrived.
 */
export default function SettingsGate({ children, requireFresh = false }) {
  const { settings, error, reload } = useSettingsStatus()
  const fresh = useSettingsAreFresh()

  /* Who sees the error, and who is allowed to carry on regardless.
     Someone browsing from a cached copy does not need an error screen — the
     menu works, the phone number is in the header, and interrupting them for a
     failure that costs them nothing would be worse than staying quiet.
     Someone on the cart or the checkout is a different case. They cannot be
     served from cache, so a swallowed error leaves them on a spinner with no
     way out — which is exactly what the fourth audit found. Here the error is
     the thing they need, because the retry button is attached to it. */
  if (error && (!settings || requireFresh)) {
    return (
      <div className="gate">
        <div className="gate-box">
          <strong>{COPY.common.settingsErrorTitle}</strong>
          <p>{COPY.common.settingsErrorBody}</p>
          <button type="button" className="btn-solid" onClick={reload}>
            {COPY.common.retry}
          </button>
        </div>
      </div>
    )
  }

  if (!settings || (requireFresh && !fresh)) {
    return (
      <div className="gate" aria-busy="true">
        <span className="gate-spinner" aria-hidden="true" />
        <span className="gate-loading">{COPY.common.loading}</span>
      </div>
    )
  }

  return children
}
