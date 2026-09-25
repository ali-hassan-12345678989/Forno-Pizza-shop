import { useId, useMemo, useState } from 'react'
import { COPY } from '../content/copy'
import { formatQuantity } from '../lib/format'
import './StockTable.css'
import SearchField from './SearchField'

/** The two ways to look at the list. Named so no call site spells one. */
const VIEWS = { needs: 'needs', all: 'all' }

/**
 * Current stock for every ingredient (FR-6.3, and FR-7.5 for the Admin, who
 * sees the identical table with no controls on it).
 *
 * Which rows come back, what counts as low, and what order they arrive in are
 * all decided by staff_ingredients(). Recomputing any of that here would create
 * a second opinion able to disagree with the one driving the actual alerts.
 * The search and the filter only ever hide rows; they never re-rank them.
 *
 * `onBookIn` is what turns this from a report into somewhere to work: the row
 * that says an ingredient is short is also the row that books more of it in.
 * Passing nothing leaves the read-only table the Admin gets, which is the whole
 * of FR-7.5 — receive_stock() refuses them regardless.
 */
export default function StockTable({ rows, onBookIn, queuedIds }) {
  const t = COPY.staff.stock

  const low = rows.filter((row) => row.isLow && !row.isOut).length
  const out = rows.filter((row) => row.isOut).length
  const needsAttention = low + out

  const [query, setQuery] = useState('')
  // Opens on what needs ordering, but only when something does. A delivery
  // arrives whether or not the shop is short of anything, and a Manager holding
  // the note should not have to find the filter before they can book it in.
  // An initialiser, not a prop, so switching views afterwards sticks.
  const [view, setView] = useState(() => (needsAttention > 0 ? VIEWS.needs : VIEWS.all))
  const searchId = useId()

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return rows.filter((row) => {
      if (needle && !row.name.toLowerCase().includes(needle)) return false
      // A row already on the sheet stays in view while "Needs ordering" is on,
      // so the Manager can see what they have queued without switching filters.
      if (view === VIEWS.needs) return row.isLow || row.isOut || queuedIds?.has(row.id)
      return true
    })
  }, [rows, query, view, queuedIds])

  if (rows.length === 0) return <p className="stock-empty">{t.empty}</p>

  return (
    <section className="stock panel" aria-labelledby="stock-title">
      <div className="stock-head">
        <div>
          <h2 id="stock-title">{t.title}</h2>
          <p className="stock-summary">{t.summary(rows.length, low, out)}</p>
        </div>
      </div>

      <div className="stock-controls">
        <SearchField id={searchId} label={t.searchLabel} value={query} onChange={setQuery} />

        <div className="stock-filters" role="group" aria-label={t.filterLabel}>
          <button
            type="button"
            className="chip"
            aria-pressed={view === VIEWS.needs}
            onClick={() => setView(VIEWS.needs)}
          >
            {t.filterNeeds}
            {needsAttention > 0 && <span className="chip-count">{needsAttention}</span>}
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={view === VIEWS.all}
            onClick={() => setView(VIEWS.all)}
          >
            {t.filterAll}
          </button>
        </div>
      </div>

      {shown.length === 0 && (
        <p className="stock-none">{query.trim() ? t.noMatch(query.trim()) : t.nothingLow}</p>
      )}

      {shown.length > 0 && (
        <>
          <div className="stock-scroll">
            <table className="stock-table">
              <thead>
                <tr>
                  <th scope="col">{t.colIngredient}</th>
                  <th scope="col" className="num">
                    {t.colStock}
                  </th>
                  <th scope="col" className="num">
                    {t.colThreshold}
                  </th>
                  <th scope="col">{t.colStatus}</th>
                  {onBookIn && (
                    <th scope="col" className="stock-act">
                      <span className="sr-only">{t.colBookIn}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <StockRow
                    key={row.id}
                    row={row}
                    onBookIn={onBookIn}
                    queued={Boolean(queuedIds?.has(row.id))}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {shown.length < rows.length && (
            <p className="stock-showing">{t.showing(shown.length, rows.length)}</p>
          )}
        </>
      )}
    </section>
  )
}

function StockRow({ row, onBookIn, queued }) {
  const t = COPY.staff.stock
  const r = COPY.staff.receive
  const state = row.isOut ? 'out' : row.isLow ? 'low' : 'ok'

  return (
    <tr className={`is-${state}${queued ? ' is-queued' : ''}`}>
      <th scope="row">{row.name}</th>
      <td className="num">{formatQuantity(row.stock, row.unit)}</td>
      <td className="num muted">{formatQuantity(row.threshold, row.unit)}</td>
      <td>
        <span className={`stock-pill ${state}`}>
          {row.isOut ? t.statusOut : row.isLow ? t.statusLow : t.statusOk}
        </span>
      </td>
      {onBookIn && (
        <td className="stock-act">
          <button
            type="button"
            className={`stock-add${queued ? ' on' : ''}`}
            disabled={queued}
            aria-label={queued ? r.addedAria(row.name) : r.addAria(row.name)}
            onClick={() => onBookIn(row.id)}
          >
            {queued ? r.added : r.add}
          </button>
        </td>
      )}
    </tr>
  )
}
