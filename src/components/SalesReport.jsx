import { useCallback, useEffect, useMemo, useState } from 'react'
import CancelledOrders from './CancelledOrders'
import Dayparts from './Dayparts'
import TrendChart from './TrendChart'
import { COPY } from '../content/copy'
import {
  ALL_REPORT_PERIODS,
  DEFAULT_REPORT_PERIOD,
  REPORT_WINDOW,
  SHOP_TIME_ZONE,
} from '../config/reports'
import { CANCELLED_DAYS, DAYPART_DAYS } from '../config/insights'
import { fetchSalesReport } from '../api/reports'
import { fetchCancelledOrders, fetchDayparts } from '../api/insights'
import { formatPeriod, formatPrice } from '../lib/format'
import { useAsyncData } from '../lib/useAsyncData'
import './SalesReport.css'

/**
 * FR-6.4 for the Manager, FR-7.4 for the Admin. One component, because both
 * want the same numbers — the Manager to reconcile against stock, the Admin
 * to watch the business. Two copies would be two places for "a sale" to mean
 * something slightly different.
 *
 * Every figure comes from sales_report(). The totals below are a sum of the
 * rows the database returned, not an independent calculation, so the strip and
 * the table can never disagree.
 *
 * THREE THINGS THE OWNER'S REVIEW ADDED.
 *
 * A chart, because the period toggle used to change nothing but a static table
 * and a peak was something you found by reading down a column of figures.
 *
 * A way into the cancelled figure. They saw "168 cancelled" against "6 orders"
 * and read it as the shop bleeding customers; it was the regression suite's
 * test orders, since cleared. A number that alarming has to be openable, or
 * every future one gets taken on trust and worried about.
 *
 * A day-part breakdown, because a daily total cannot tell anybody whether to
 * put a second driver on at seven or at eleven.
 */
export default function SalesReport() {
  const t = COPY.staff.sales

  const [period, setPeriod] = useState(DEFAULT_REPORT_PERIOD)
  const [rows, setRows] = useState(null)
  const [errorCode, setErrorCode] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showCancelled, setShowCancelled] = useState(false)

  const load = useCallback(async (next) => {
    setLoading(true)
    setErrorCode(null)
    const { rows: data, errorCode: code } = await fetchSalesReport(next, REPORT_WINDOW[next])
    setRows(data)
    setErrorCode(code)
    setLoading(false)
  }, [])

  useEffect(() => {
    load(period)
  }, [load, period])

  const dayparts = useAsyncData(async () => {
    const { rows: data, errorCode: code } = await fetchDayparts(DAYPART_DAYS)
    return { data, errorCode: code }
  })

  const cancelled = useAsyncData(async () => {
    const { rows: data, errorCode: code } = await fetchCancelledOrders(CANCELLED_DAYS)
    return { data, errorCode: code }
  })

  const totals = useMemo(() => {
    if (!rows) return null
    return rows.reduce(
      (acc, r) => ({
        orders: acc.orders + r.orders,
        revenue: acc.revenue + r.revenue,
        goods: acc.goods + r.goodsRevenue,
        cancelled: acc.cancelled + r.cancelled,
      }),
      { orders: 0, revenue: 0, goods: 0, cancelled: 0 },
    )
  }, [rows])

  /* Oldest first. sales_report() returns newest first, which is right for a
     table somebody scans from the top and wrong for a chart, where time has to
     run left to right or the shape means the opposite of what it looks like. */
  const points = useMemo(
    () =>
      [...(rows ?? [])].reverse().map((r) => ({
        key: r.periodStart,
        value: r.revenue,
        label: formatPeriod(r.periodStart, period),
      })),
    [rows, period],
  )

  return (
    <section className="sales" aria-labelledby="sales-title">
      <div className="sales-head">
        <h2 id="sales-title">{t.title}</h2>
        <div className="sales-periods" role="tablist" aria-label={t.periodLabel}>
          {ALL_REPORT_PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={p === period}
              className={p === period ? 'on' : ''}
              onClick={() => setPeriod(p)}
            >
              {t.periods[p]}
            </button>
          ))}
        </div>
      </div>

      <p className="sales-window">{t.window[period]}</p>

      {loading && <p aria-busy="true">{t.loading}</p>}

      {!loading && errorCode && (
        <div className="form-alert" role="alert">
          <p>{t.errors[errorCode] ?? t.errors.unknown}</p>
          <button type="button" className="btn-ghost" onClick={() => load(period)}>
            {t.retry}
          </button>
        </div>
      )}

      {!loading && !errorCode && rows && rows.length === 0 && (
        <p className="sales-empty">{t.empty}</p>
      )}

      {!loading && !errorCode && rows && rows.length > 0 && (
        <>
          <dl className="sales-totals">
            <div>
              <dt>{t.totalOrders}</dt>
              <dd>{totals.orders}</dd>
            </div>
            <div>
              <dt>{t.totalRevenue}</dt>
              <dd>{formatPrice(totals.revenue)}</dd>
            </div>
            <div>
              <dt>{t.totalGoods}</dt>
              <dd>{formatPrice(totals.goods)}</dd>
            </div>
            <div className={totals.cancelled > 0 ? 'warn' : ''}>
              <dt>{t.totalCancelled}</dt>
              <dd>
                {/* A figure you can open. Only when there is something behind
                    it — a button that reveals "nothing to show" has wasted a
                    click and taught the reader not to try again. */}
                {totals.cancelled > 0 ? (
                  <button
                    type="button"
                    className="sales-drill"
                    aria-expanded={showCancelled}
                    aria-controls="cancelled-detail"
                    onClick={() => setShowCancelled((open) => !open)}
                  >
                    {totals.cancelled}
                  </button>
                ) : (
                  totals.cancelled
                )}
              </dd>
            </div>
          </dl>

          {showCancelled && (
            <div id="cancelled-detail" className="sales-detail">
              <CancelledOrders
                rows={cancelled.data}
                days={CANCELLED_DAYS}
                total={totals.cancelled}
                loading={cancelled.loading}
                errorCode={cancelled.errorCode}
                onRetry={() => cancelled.reload()}
              />
            </div>
          )}

          <TrendChart
            points={points}
            label={t.chartAria(period)}
            formatLabel={(point) => point.label}
            formatValue={(point) => t.chartPeak(point.label, formatPrice(point.value))}
          />

          <div className="sales-scroll">
            <table className="sales-table">
              <thead>
                <tr>
                  <th scope="col">{t.colPeriod}</th>
                  <th scope="col" className="num">
                    {t.colOrders}
                  </th>
                  <th scope="col" className="num">
                    {t.colRevenue}
                  </th>
                  <th scope="col" className="num">
                    {t.colGoods}
                  </th>
                  <th scope="col" className="num">
                    {t.colCancelled}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.periodStart}>
                    <th scope="row">{formatPeriod(r.periodStart, period)}</th>
                    <td className="num">{r.orders}</td>
                    <td className="num">{formatPrice(r.revenue)}</td>
                    <td className="num muted">{formatPrice(r.goodsRevenue)}</td>
                    <td className={r.cancelled > 0 ? 'num warn' : 'num muted'}>{r.cancelled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="sales-note">{t.goodsNote}</p>
          <p className="sales-note">{t.timeZoneNote(SHOP_TIME_ZONE)}</p>
        </>
      )}

      {/* Outside the period toggle on purpose. Day-parts are a fixed window
          because their whole job is to average out the noise of a single day,
          and re-cutting them by "yearly" would be a chart of nothing. */}
      <Dayparts
        rows={dayparts.data}
        days={DAYPART_DAYS}
        loading={dayparts.loading}
        errorCode={dayparts.errorCode}
        onRetry={() => dayparts.reload()}
      />
    </section>
  )
}
