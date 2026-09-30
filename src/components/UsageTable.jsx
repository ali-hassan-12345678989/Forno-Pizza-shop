import { useId, useMemo, useState } from 'react'
import { COPY } from '../content/copy'
import { SHOP_TIME_ZONE } from '../config/usage'
import {
  countedCount,
  movedCount,
  shareOfBusiest,
  varianceCount,
  visibleRows,
} from '../lib/usageRows'
import { formatDateTime, formatQuantity, formatSignedQuantity } from '../lib/format'
import './UsageTable.css'
import SearchField from './SearchField'

/**
 * How much of each ingredient the kitchen got through over the chosen window,
 * and — where anybody counted — whether the shelf agreed.
 *
 * THE VARIANCE COLUMN IS THE POINT OF THIS SCREEN NOW. The owner asked for
 * theoretical usage to be compared against actual usage. In this system those
 * were the same calculation: place_order() works each requirement out from the
 * recipe and writes exactly that figure to the ledger, so their difference was
 * always going to be zero — including on the day somebody put double cheese on
 * every pizza, which is what the comparison was for. A physical count is the
 * only number the recipes did not produce, and so the only one the books can
 * honestly be checked against.
 *
 * Three states, and they are not shades of one another. A blank means nobody
 * counted. Zero means somebody counted and it balanced. A figure means the
 * shelf and the books disagreed by that much. Rendering the first two the same
 * way would turn "we never looked" into "all clear", which is the exact
 * misreading this column exists to prevent.
 *
 * The bar beside the used figure is a share of the BUSIEST row in the window,
 * not of its total. Shares of a sum are all slivers once there are thirty
 * ingredients; a bar that fills the width for the biggest consumer is readable
 * at a glance. It ranks within one column only — 20,000 g of dough and 40 pcs
 * of buns are different quantities of different things and are never compared.
 */
export default function UsageTable({ rows, rangeLabel }) {
  const t = COPY.staff.usage

  const [query, setQuery] = useState('')
  /* Opens on what has actually moved, which is the question being asked — but
     only when something has. On a quiet morning that filter empties the whole
     screen, so it falls back to the full list rather than showing nothing at
     all. Same fix, and the same reason, as the stock table's default view.
     An initialiser rather than a prop, so switching afterwards sticks. */
  const [onlyUsed, setOnlyUsed] = useState(() => movedCount(rows) > 0)
  const [onlyVariance, setOnlyVariance] = useState(false)
  const searchId = useId()

  const moved = useMemo(() => movedCount(rows), [rows])
  const counted = useMemo(() => countedCount(rows), [rows])
  const offBooks = useMemo(() => varianceCount(rows), [rows])
  const shown = useMemo(
    () => visibleRows(rows, { query, onlyUsed, onlyVariance }),
    [rows, query, onlyUsed, onlyVariance],
  )
  const shareOf = useMemo(() => shareOfBusiest(rows), [rows])

  if (!rows || rows.length === 0) return <p className="usage-empty">{t.empty}</p>

  const setFilter = (next) => {
    setOnlyUsed(next === 'used')
    setOnlyVariance(next === 'variance')
  }
  const filter = onlyVariance ? 'variance' : onlyUsed ? 'used' : 'all'

  return (
    <section className="usage panel" aria-labelledby="usage-title">
      <div className="usage-head">
        <div>
          <h2 id="usage-title">{t.title}</h2>
          <p className="usage-summary">{t.summary(moved, rows.length)}</p>
        </div>
      </div>

      {/* Said out loud so nobody has to guess whose midnight decides the ends
          of this window. The same zone the sales report buckets by, which is
          what makes the two screens comparable at all. */}
      <p className="usage-note">{t.rangeNote(rangeLabel, SHOP_TIME_ZONE)}</p>

      <p className="usage-note">
        {counted === 0 ? t.noCounts : t.countsTaken(counted, rows.length, offBooks)}
      </p>

      <div className="usage-controls">
        <SearchField id={searchId} label={t.searchLabel} value={query} onChange={setQuery} />

        <div className="usage-filters" role="group" aria-label={t.filterLabel}>
          <button
            type="button"
            className="chip"
            aria-pressed={filter === 'used'}
            onClick={() => setFilter('used')}
          >
            {t.onlyUsed}
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={filter === 'variance'}
            onClick={() => setFilter('variance')}
            disabled={offBooks === 0}
          >
            {t.onlyVariance}
            {offBooks > 0 && <span className="chip-count">{offBooks}</span>}
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            {t.showAll}
          </button>
        </div>
      </div>

      {shown.length === 0 && (
        <p className="usage-empty">
          {query.trim() ? t.noMatch : onlyVariance ? t.noVariance : t.noneUsed}
        </p>
      )}

      {shown.length > 0 && (
        <div className="usage-scroll">
          <table className="usage-table">
            <thead>
              <tr>
                <th scope="col">{t.colIngredient}</th>
                <th scope="col" className="num">
                  {t.colUsed}
                </th>
                <th scope="col" className="num">
                  {t.colReceived}
                </th>
                <th scope="col" className="num">
                  {t.colVariance}
                </th>
                <th scope="col" className="num">
                  {t.colStock}
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <UsageRow key={row.id} row={row} share={shareOf(row)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shown.length > 0 && shown.length < rows.length && (
        <p className="usage-showing">{t.showing(shown.length, rows.length)}</p>
      )}
      <p className="usage-showing">{t.ledgerNote}</p>
    </section>
  )
}

function UsageRow({ row, share }) {
  const t = COPY.staff.usage
  const counted = row.variance !== null

  return (
    <tr>
      <th scope="row">{row.name}</th>

      <td className="num">
        {row.used > 0 ? (
          <>
            <span className="usage-figure">{formatQuantity(row.used, row.unit)}</span>
            {/* Presentational: the figure beside it is the actual answer, so
                the bar carries no label of its own and stays out of the
                accessibility tree rather than reading out a second number. */}
            <span className="usage-bar" aria-hidden="true">
              <span className="usage-fill" style={{ inlineSize: `${Math.round(share * 100)}%` }} />
            </span>
          </>
        ) : (
          <span className="usage-none">{t.none}</span>
        )}
      </td>

      <td className="num muted">
        {row.received > 0 ? formatQuantity(row.received, row.unit) : t.none}
      </td>

      <td className="num">
        {!counted ? (
          <span className="usage-uncounted">{t.notCounted}</span>
        ) : row.variance === 0 ? (
          <span className="usage-clean" title={t.countedAt(formatDateTime(row.lastCountedAt))}>
            {t.balanced}
          </span>
        ) : (
          <span className={row.variance < 0 ? 'usage-short' : 'usage-over'}>
            {formatSignedQuantity(row.variance, row.unit)}
          </span>
        )}
      </td>

      <td className="num">
        <span className={row.isOut ? 'usage-out' : row.isLow ? 'usage-low' : undefined}>
          {formatQuantity(row.stock, row.unit)}
        </span>
      </td>
    </tr>
  )
}
