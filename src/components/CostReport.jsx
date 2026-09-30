import { useMemo } from 'react'
import { COPY } from '../content/copy'
import { MIX_CLASSES, classifyMix, countByClass } from '../lib/productMix'
import { formatDuration, formatPrice, formatPriceOrUnknown } from '../lib/format'
import './CostReport.css'

/**
 * What the food cost, what it should have cost, and which pizzas are worth
 * making.
 *
 * Everything here is null-aware, and that is the whole design. The shop starts
 * with no ingredient priced at all, so "unknown" is the normal state of these
 * figures for as long as it takes somebody to fill the costs in — and a report
 * that rendered unknown as zero would be at its most confident exactly when it
 * knew least. Every panel therefore states its own coverage.
 */

/** Food cost across the window, and the leak counting found on top of it. */
export function CogsPanel({ cogs }) {
  const t = COPY.staff.cogs
  if (!cogs) return null

  const covered = cogs.totalIngredients > 0 && cogs.pricedIngredients === cogs.totalIngredients
  const nothingPriced = cogs.pricedIngredients === 0

  /* Food cost as a percentage of what the food sold for — the number a
     restaurant actually manages by. Undefined rather than zero when nothing was
     sold, because a percentage of nothing is not 0%. */
  const foodCostPercent = cogs.goodsRevenue > 0 ? (cogs.actualCost / cogs.goodsRevenue) * 100 : null

  return (
    <section className="cogs panel" aria-labelledby="cogs-title">
      <h2 id="cogs-title" className="staff-panel-title">
        {t.title}
      </h2>

      {nothingPriced ? (
        <p className="cogs-none">{t.nothingPriced}</p>
      ) : (
        <>
          {!covered && (
            <p className="cogs-partial">
              {t.partial(cogs.pricedIngredients, cogs.totalIngredients)}
            </p>
          )}

          <dl className="cogs-figures">
            <div>
              <dt>{t.goodsRevenue}</dt>
              <dd>{formatPrice(cogs.goodsRevenue)}</dd>
            </div>
            <div>
              <dt>{t.theoretical}</dt>
              <dd>{formatPrice(cogs.theoreticalCost)}</dd>
            </div>
            <div className={cogs.varianceCost < 0 ? 'warn' : ''}>
              <dt>{t.leak}</dt>
              {/* Negative means stock left without an order to explain it.
                  Shown as a positive cost, because a leak of Rs. 400 is Rs. 400
                  gone — the minus sign belongs to the stock movement, not to
                  the money. */}
              <dd>{formatPrice(Math.abs(cogs.varianceCost))}</dd>
            </div>
            <div>
              <dt>{t.actual}</dt>
              <dd>{formatPrice(cogs.actualCost)}</dd>
            </div>
            <div>
              <dt>{t.foodCostPercent}</dt>
              <dd>{foodCostPercent === null ? t.noSales : `${foodCostPercent.toFixed(1)}%`}</dd>
            </div>
          </dl>

          <p className="staff-note">{cogs.varianceCost === 0 ? t.noLeak : t.leakNote}</p>
        </>
      )}
    </section>
  )
}

/** How long each stage of an order actually takes. */
export function TimingsPanel({ rows, days }) {
  const t = COPY.staff.timings

  if (!rows || rows.length === 0) {
    return (
      <section className="timings panel" aria-labelledby="timings-title">
        <h2 id="timings-title" className="staff-panel-title">
          {t.title}
        </h2>
        <p className="staff-note">{t.empty(days)}</p>
      </section>
    )
  }

  return (
    <section className="timings panel" aria-labelledby="timings-title">
      <h2 id="timings-title" className="staff-panel-title">
        {t.title}
      </h2>
      <p className="staff-note">{t.subtitle(days)}</p>

      <div className="timings-scroll">
        <table className="timings-table">
          <thead>
            <tr>
              <th scope="col">{t.colStage}</th>
              <th scope="col" className="num">
                {t.colTypical}
              </th>
              <th scope="col" className="num">
                {t.colMean}
              </th>
              <th scope="col" className="num">
                {t.colWorst}
              </th>
              <th scope="col" className="num">
                {t.colOrders}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.stage}>
                <th scope="row">{row.stage}</th>
                {/* The median leads, and is the emphasised column. One order
                    forgotten overnight drags a mean into uselessness, and a
                    kitchen's worst day is exactly when somebody reads this. */}
                <td className="num strong">{formatDuration(row.medianSeconds)}</td>
                <td className="num muted">{formatDuration(row.meanSeconds)}</td>
                <td className="num muted">{formatDuration(row.worstSeconds)}</td>
                <td className="num muted">{row.ordersTimed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="staff-note">{t.stagesNote}</p>
    </section>
  )
}

/** Which items are worth selling. */
export function ProductMixPanel({ rows, days }) {
  const t = COPY.staff.mix

  const classified = useMemo(() => classifyMix(rows), [rows])
  const counts = useMemo(() => countByClass(classified), [classified])

  if (!rows || rows.length === 0) {
    return (
      <section className="mix panel" aria-labelledby="mix-title">
        <h2 id="mix-title" className="staff-panel-title">
          {t.title}
        </h2>
        <p className="staff-note">{t.empty(days)}</p>
      </section>
    )
  }

  const unknown = counts[MIX_CLASSES.unknown]

  return (
    <section className="mix panel" aria-labelledby="mix-title">
      <h2 id="mix-title" className="staff-panel-title">
        {t.title}
      </h2>
      <p className="staff-note">{t.subtitle(days)}</p>

      {/* Items with no known cost are not classified and are not hidden either.
          Guessing a quadrant from a missing price is how a pizza gets taken off
          a menu for being a dog when nobody had priced its cheese. */}
      {unknown > 0 && <p className="mix-unpriced">{t.unpriced(unknown)}</p>}

      <div className="mix-scroll">
        <table className="mix-table">
          <thead>
            <tr>
              <th scope="col">{t.colItem}</th>
              <th scope="col" className="num">
                {t.colSold}
              </th>
              <th scope="col" className="num">
                {t.colRevenue}
              </th>
              <th scope="col" className="num">
                {t.colMarginEach}
              </th>
              <th scope="col">{t.colClass}</th>
            </tr>
          </thead>
          <tbody>
            {classified.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.name}</th>
                <td className="num">{row.quantity}</td>
                <td className="num muted">{formatPrice(row.revenue)}</td>
                <td className="num">{formatPriceOrUnknown(row.marginPerUnit, t.notPriced)}</td>
                <td>
                  <span className={`mix-pill ${row.mixClass}`}>{t.classes[row.mixClass]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="staff-note">{t.legend}</p>
    </section>
  )
}
