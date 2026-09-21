import { COPY } from '../content/copy'
import { formatQuantity } from '../lib/format'
import './StockTable.css'

/**
 * Current stock for every ingredient (FR-6.3, and FR-7.5 for the Admin, who
 * sees the identical table with no controls on it).
 *
 * Purely a renderer: which rows come back, what counts as low, and what order
 * they arrive in are all decided by staff_ingredients(). Recomputing any of
 * that here would create a second opinion that could disagree with the one
 * driving the actual alerts.
 */
export default function StockTable({ rows }) {
  const t = COPY.staff.stock

  if (rows.length === 0) return <p className="stock-empty">{t.empty}</p>

  const low = rows.filter((r) => r.isLow && !r.isOut).length
  const out = rows.filter((r) => r.isOut).length

  return (
    <section className="stock" aria-labelledby="stock-title">
      <div className="stock-head">
        <h2 id="stock-title">{t.title}</h2>
        <p className="stock-summary">{t.summary(rows.length, low, out)}</p>
      </div>

      {low === 0 && out === 0 && <p className="stock-healthy">{t.allHealthy}</p>}

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
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.isOut ? 'is-out' : row.isLow ? 'is-low' : ''}>
                <th scope="row">{row.name}</th>
                <td className="num">{formatQuantity(row.stock, row.unit)}</td>
                <td className="num muted">{formatQuantity(row.threshold, row.unit)}</td>
                <td>
                  <span className={`stock-pill ${row.isOut ? 'out' : row.isLow ? 'low' : 'ok'}`}>
                    {row.isOut ? t.statusOut : row.isLow ? t.statusLow : t.statusOk}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
