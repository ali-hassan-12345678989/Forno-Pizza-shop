import { COPY } from '../content/copy'
// Deliberately the gate's stylesheet rather than a copy of it. Both are the
// same moment — the app cannot show you this screen yet — and a second spinner
// with its own keyframes would be two things to keep in step, including the
// prefers-reduced-motion rule that stops the ring rotating.
import './SettingsGate.css'

/**
 * Shown while a lazily-loaded route fetches its chunk.
 *
 * The staff panels are split out of the customer bundle, so the first visit to
 * /manager, /admin or /chef waits on a network request that the customer site
 * never makes. On the shop's own wifi that is a blink; on a phone in a power
 * cut it is not, and an empty frame would read as a broken panel.
 */
export default function RouteFallback() {
  return (
    <div className="gate" aria-busy="true">
      <span className="gate-spinner" aria-hidden="true" />
      <span className="gate-loading">{COPY.common.loading}</span>
    </div>
  )
}
