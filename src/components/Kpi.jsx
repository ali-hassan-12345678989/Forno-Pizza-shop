import './Kpi.css'

/**
 * One headline figure.
 *
 * Every card reads in the same order — label, value, then one line of context —
 * because a row of tiles is only scannable if the eye can land in the same
 * place on each. `tone` is state, not decoration: 'attention' is reserved for
 * a number somebody has to do something about.
 */
export function Kpi({ label, value, meta, tone }) {
  return (
    <div className={tone ? `kpi kpi-${tone}` : 'kpi'}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {meta && <div className="kpi-meta">{meta}</div>}
    </div>
  )
}

/** The row they sit in. Wraps to one column on a phone. */
export function KpiRow({ children }) {
  return <div className="kpi-row">{children}</div>
}
