import { COPY } from '../content/copy'
import { formatPrice, formatPriceOrUnknown } from '../lib/format'
import ExportButton from './ExportButton'
import './MenuMargins.css'

/**
 * What every size on the menu makes, thinnest first.
 *
 * The owner asked to identify low-margin items, and "identify" is the word that
 * decides the design: this is a ranked list with the worst at the top, not a
 * column added to an existing table that somebody would have to sort. The
 * database returns it in that order — see admin_menu_costs() — so the screen
 * never re-ranks it.
 *
 * A SIZE WITH ONE UNPRICED INGREDIENT HAS NO MARGIN, not a smaller one. It
 * appears, because it is still on the menu and still needs pricing, but it
 * shows what it is missing rather than a figure computed from the ingredients
 * that happen to have a cost. That figure would be flattering, confident and
 * wrong, and it is exactly the number a decision to keep or cut an item would
 * be made on.
 */
export default function MenuMargins({ rows, loading, errorCode, onRetry }) {
  const t = COPY.staff.margins

  if (loading) return <p aria-busy="true">{t.loading}</p>

  if (errorCode) {
    return (
      <div className="form-alert" role="alert">
        <p>{t.errors[errorCode] ?? t.errors.unknown}</p>
        {onRetry && (
          <button type="button" className="btn-ghost" onClick={onRetry}>
            {t.retry}
          </button>
        )}
      </div>
    )
  }

  if (!rows || rows.length === 0) return null

  const priced = rows.filter((row) => row.margin !== null)
  const unpriced = rows.length - priced.length

  return (
    <section className="margins panel" aria-labelledby="margins-title">
      <div className="margins-head">
        <div>
          <h2 id="margins-title" className="staff-panel-title">
            {t.title}
          </h2>
          <p className="staff-note">
            {priced.length === 0 ? t.nonePriced : t.subtitle(priced.length, rows.length)}
          </p>
        </div>

        <ExportButton
          rows={rows}
          filename="forno-menu-margins.csv"
          columns={[
            { key: 'itemName', header: 'Item' },
            { key: 'sizeLabel', header: 'Size' },
            { key: 'price', header: 'Price' },
            { key: 'foodCost', header: 'Food cost' },
            { key: 'margin', header: 'Margin' },
            { key: 'marginPercent', header: 'Margin %' },
          ]}
        />
      </div>

      {unpriced > 0 && <p className="margins-unpriced">{t.unpriced(unpriced)}</p>}

      <div className="margins-scroll">
        <table className="margins-table">
          <thead>
            <tr>
              <th scope="col">{t.colItem}</th>
              <th scope="col" className="num">
                {t.colPrice}
              </th>
              <th scope="col" className="num">
                {t.colCost}
              </th>
              <th scope="col" className="num">
                {t.colMargin}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.sizeId} className={row.isActive ? undefined : 'is-hidden-item'}>
                <th scope="row">
                  {row.itemName}
                  <span className="margins-size">{row.sizeLabel}</span>
                </th>
                <td className="num muted">{formatPrice(row.price)}</td>
                <td className="num">
                  {row.foodCost === null ? (
                    <span className="margins-missing">{t.missing(row.missingCosts)}</span>
                  ) : (
                    formatPrice(row.foodCost)
                  )}
                </td>
                <td className="num">
                  {row.marginPercent === null ? (
                    <span className="margins-missing">—</span>
                  ) : (
                    <>
                      <strong>{row.marginPercent}%</strong>
                      <span className="margins-abs">{formatPriceOrUnknown(row.margin, '—')}</span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="staff-note">{t.footnote}</p>
    </section>
  )
}
