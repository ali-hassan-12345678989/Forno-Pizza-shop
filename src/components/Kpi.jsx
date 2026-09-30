import Sparkline from './Sparkline'
import './Kpi.css'

/**
 * One headline figure.
 *
 * Every card reads in the same order — label, value, then one line of context —
 * because a row of tiles is only scannable if the eye can land in the same
 * place on each. `tone` is state, not decoration: 'attention' is reserved for
 * a number somebody has to do something about.
 *
 * `trend` draws the last few days behind the figure. It sits behind rather than
 * beside it because it is context, not a second number: the eye should land on
 * the value first and pick up the shape underneath it without being asked to
 * read two things. It is hidden from assistive technology entirely — the meta
 * line below already says in words what the shape says in pixels, and a screen
 * reader announcing a second, wordless chart would be repeating it badly.
 */
export function Kpi({ label, value, meta, tone, trend }) {
  const hasTrend = Array.isArray(trend) && trend.length > 1

  return (
    <div className={tone ? `kpi kpi-${tone}` : 'kpi'}>
      {hasTrend && (
        <div className="kpi-trend" aria-hidden="true">
          <Sparkline points={trend} />
        </div>
      )}
      <div className="kpi-body">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
        {meta && <div className="kpi-meta">{meta}</div>}
      </div>
    </div>
  )
}

/** The row they sit in. Wraps to one column on a phone. */
export function KpiRow({ children }) {
  return <div className="kpi-row">{children}</div>
}
