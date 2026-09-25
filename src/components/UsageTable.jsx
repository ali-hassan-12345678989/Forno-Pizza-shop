import { useId, useMemo, useState } from 'react'
import { COPY } from '../content/copy'
import { ALL_USAGE_PERIODS, DEFAULT_USAGE_PERIOD, SHOP_TIME_ZONE } from '../config/usage'
import { movedCount, shareOfBusiest, usedIn, visibleRows } from '../lib/usageRows'
import { formatQuantity, formatShopDate } from '../lib/format'
import './UsageTable.css'
import SearchField from './SearchField'

/**
 * How much of each ingredient the kitchen has got through.
 *
 * Both figures — today and all time — arrive on the same row from one call, so
 * switching between them is instant and the screen can never show two moments
 * at once.
 *
 * The bar beside each figure is a share of the BUSIEST row in that column, not
 * of the column's sum. Shares of a sum are all slivers once there are thirty
 * ingredients; a bar that fills the width for the biggest consumer is readable
 * at a glance. It ranks within one column only — 20,000 g of dough and 40 pcs
 * of buns are different quantities of different things and are never compared.
 */
export default function UsageTable({ rows }) {
  const t = COPY.staff.usage

  const [period, setPeriod] = useState(DEFAULT_USAGE_PERIOD)
  const [query, setQuery] = useState('')
  /* Opens on what has actually moved, which is the question being asked — but
     only when something has. On a quiet morning that filter empties the whole
     screen, so it falls back to the full list rather than showing nothing at
     all. Same fix, and the same reason, as the stock table's default view.
     An initialiser rather than a prop, so switching afterwards sticks. */
  const [onlyUsed, setOnlyUsed] = useState(() => movedCount(rows, DEFAULT_USAGE_PERIOD) > 0)
  const searchId = useId()

  const moved = useMemo(() => movedCount(rows, period), [rows, period])
  const shown = useMemo(
    () => visibleRows(rows, { period, query, onlyUsed }),
    [rows, period, query, onlyUsed],
  )
  const shareOf = useMemo(() => shareOfBusiest(rows, period), [rows, period])

  const today = useMemo(() => formatShopDate(new Date(), SHOP_TIME_ZONE), [])

  if (rows.length === 0) return <p className="usage-empty">{t.empty}</p>

  return (
    <section className="usage panel" aria-labelledby="usage-title">
      <div className="usage-head">
        <div>
          <h2 id="usage-title">{t.title}</h2>
          <p className="usage-summary">{t.summary(moved, rows.length)}</p>
        </div>

        <div className="usage-periods" role="group" aria-label={t.periodLabel}>
          {ALL_USAGE_PERIODS.map((key) => (
            <button
              key={key}
              type="button"
              className="chip"
              aria-pressed={period === key}
              onClick={() => setPeriod(key)}
            >
              {t.periods[key]}
            </button>
          ))}
        </div>
      </div>

      <p className="usage-note">{t.dayNote(today)}</p>

      <div className="usage-controls">
        <SearchField id={searchId} label={t.searchLabel} value={query} onChange={setQuery} />

        <div className="usage-filters" role="group" aria-label={t.periodLabel}>
          <button
            type="button"
            className="chip"
            aria-pressed={onlyUsed}
            onClick={() => setOnlyUsed(true)}
          >
            {t.onlyUsed}
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={!onlyUsed}
            onClick={() => setOnlyUsed(false)}
          >
            {t.showAll}
          </button>
        </div>
      </div>

      {shown.length === 0 && (
        <p className="usage-empty">{query.trim() ? t.noMatch : t.noneUsed[period]}</p>
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
                  {t.colStock}
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <UsageRow key={row.id} row={row} period={period} share={shareOf(row)} />
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

function UsageRow({ row, period, share }) {
  const t = COPY.staff.usage
  const used = usedIn(row, period)

  return (
    <tr>
      <th scope="row">{row.name}</th>

      <td className="num">
        {used > 0 ? (
          <>
            <span className="usage-figure">{formatQuantity(used, row.unit)}</span>
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

      <td className="num">
        <span className={row.isOut ? 'usage-out' : row.isLow ? 'usage-low' : undefined}>
          {formatQuantity(row.stock, row.unit)}
        </span>
      </td>
    </tr>
  )
}
