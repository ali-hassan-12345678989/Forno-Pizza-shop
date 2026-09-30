import { Link } from 'react-router-dom'
import { Kpi, KpiRow } from '../components/Kpi'
import PageHead from '../components/PageHead'
import StaffError from '../components/StaffError'
import StockAlerts from '../components/StockAlerts'
import TopItems from '../components/TopItems'
import { COPY } from '../content/copy'
import { REPORT_PERIODS, SHOP_TIME_ZONE } from '../config/reports'
import { TOP_ITEMS_DAYS, TREND_DAYS } from '../config/insights'
import { SECTION_IDS, pathTo } from '../config/staffNav'
import { STAFF_ROLES } from '../config/staff'
import { fetchStockAlerts, fetchStockLevels } from '../api/inventory'
import { fetchActiveOrders } from '../api/activeOrders'
import { fetchSalesReport } from '../api/reports'
import { fetchTopItems } from '../api/insights'
import { dailySeries, describePacing, pacingAgainstWeekday } from '../lib/pacing'
import { shopDayKey } from '../lib/shopDays'
import { formatPrice, formatShopDate, formatTime, formatWeekday } from '../lib/format'
import { STAFF_POLL_MS } from '../config/staffPoll'
import { useAsyncData } from '../lib/useAsyncData'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/**
 * The Manager's first screen: is anything wrong, and how is today going.
 *
 * WHAT CHANGED, AND WHY. The owner's review said this screen was giving its
 * best space to a data-entry form and its headline figures no context. Both
 * were fair.
 *
 * The delivery sheet has moved to the stock section — not deleted, moved to
 * where the stock it books in already is. Booking in a delivery means reading
 * a note against a shelf, which is the stock screen's whole job; here it was a
 * form with no table beside it, taking the top third of the page whether or not
 * a van had been anywhere near the shop.
 *
 * The two trading figures now carry the last four weeks behind them and a line
 * saying how today compares with the SAME WEEKDAY. "Orders today: 6" is a
 * number with nothing to lean on — six is a good Tuesday and a poor Saturday,
 * and the screen could not tell the difference. The comparison is weekday to
 * weekday because that is the cycle this trade actually runs on.
 *
 * Every figure still comes from a function the database exposes. The only
 * arithmetic here is averaging rows sales_report() already grouped, which is
 * the same posture as the totals strip on the sales screen.
 */
export default function ManagerDashboard() {
  const t = COPY.staff
  const d = t.dashboard
  useDocumentTitle(`${d.managerTitle} · ${t.managerTitle}`)

  const stock = useAsyncData(async () => {
    const { rows, errorCode } = await fetchStockLevels()
    return { data: rows, errorCode }
  })

  /* Stock moves with every order a customer places, so this is the one figure
     on the Manager's dashboard that can go stale while they are looking at it.
     Alerts follow stock and are re-read with it by reloadAll(); sales do not
     move fast enough to be worth a ten-second clock. */
  useAutoRefresh(stock.reload, STAFF_POLL_MS)

  const alerts = useAsyncData(async () => {
    const { alerts: data, errorCode } = await fetchStockAlerts()
    return { data, errorCode }
  })

  const sales = useAsyncData(async () => {
    const { rows, errorCode } = await fetchSalesReport(REPORT_PERIODS.day, TREND_DAYS)
    return { data: rows, errorCode }
  })

  const open = useAsyncData(async () => {
    const { groups, errorCode } = await fetchActiveOrders()
    return { data: groups, errorCode }
  })

  const top = useAsyncData(async () => {
    const { rows, errorCode } = await fetchTopItems(TOP_ITEMS_DAYS)
    return { data: rows, errorCode }
  })

  /* Top sellers is deliberately NOT in either of these.
     The four figures above are the operational pulse — what is short, how
     today is going, what is still open — and if any of them cannot be read the
     screen is not safe to act on and says so. What is selling is context: it is
     interesting on Monday and it is not why anybody opened this page. Letting
     it into the blocking error would mean one slow panel replacing a working
     dashboard with a retry button, which is a worse screen than the same
     dashboard with one panel apologising in the corner. */
  const loading = stock.loading || alerts.loading || sales.loading || open.loading
  const errorCode = stock.errorCode ?? alerts.errorCode ?? sales.errorCode ?? open.errorCode

  const reloadAll = (opts) => {
    stock.reload(opts)
    alerts.reload(opts)
    sales.reload(opts)
    open.reload(opts)
    top.reload(opts)
  }

  if (loading) return <p aria-busy="true">{d.loading}</p>
  if (errorCode) {
    return <StaffError code={errorCode} messages={t.stock.errors} onRetry={() => reloadAll()} />
  }

  const rows = stock.data ?? []
  const needsAttention = rows.filter((r) => r.isLow)
  const emptied = needsAttention.filter((r) => r.isOut)
  // Lowest relative to its own threshold, so a 40 g shortfall on a spice does
  // not outrank a 4 kg shortfall on dough.
  const worst = [...needsAttention].sort(
    (a, b) => a.stock / (a.threshold || 1) - b.stock / (b.threshold || 1),
  )[0]

  // sales_report returns newest first, so the first row is today only if the
  // shop has taken an order today. No orders yet means no bucket at all — which
  // is exactly why dailySeries() fills the gaps rather than reading these rows
  // as a continuous run of trading days.
  const now = new Date()
  const today = shopDayKey(now, SHOP_TIME_ZONE)
  const weekday = formatWeekday(now, SHOP_TIME_ZONE)
  const series = dailySeries(sales.data, { days: TREND_DAYS, today })

  const todayBucket = sales.data?.[0]?.periodStart === today ? sales.data[0] : null
  const openGroups = open.data ?? []
  const openTotal = openGroups.reduce((sum, g) => sum + g.count, 0)
  const oldest = openGroups[0]?.oldestAt

  const paceMeta = (field) => {
    const said = describePacing(pacingAgainstWeekday(series, { date: today, field }))
    if (said.kind === 'ahead') return d.pacingAhead(said.percent, said.samples, weekday)
    if (said.kind === 'behind') return d.pacingBehind(said.percent, said.samples, weekday)
    if (said.kind === 'level') return d.pacingLevel(said.samples, weekday)
    if (said.kind === 'fromNothing') return d.pacingFromNothing
    return d.pacingNoHistory
  }

  return (
    <>
      <PageHead title={d.managerTitle} subtitle={d.subtitle(formatShopDate(now, SHOP_TIME_ZONE))}>
        <Link className="btn-ghost" to={pathTo(STAFF_ROLES.manager, SECTION_IDS.stock)}>
          {d.seeAllStock}
        </Link>
      </PageHead>

      <KpiRow>
        <Kpi
          label={d.needsReordering}
          value={needsAttention.length}
          tone={
            emptied.length > 0 ? 'critical' : needsAttention.length > 0 ? 'attention' : undefined
          }
          meta={
            emptied.length > 0
              ? d.needsReorderingOut(emptied[0].name)
              : worst
                ? d.needsReorderingSome(worst.name)
                : d.needsReorderingNone
          }
        />
        <Kpi
          label={d.ordersToday}
          value={todayBucket ? todayBucket.orders : 0}
          meta={paceMeta('orders')}
          trend={series.map((point) => point.orders)}
        />
        <Kpi
          label={d.revenueToday}
          value={formatPrice(todayBucket ? todayBucket.revenue : 0)}
          meta={paceMeta('revenue')}
          trend={series.map((point) => point.revenue)}
        />
        <Kpi
          label={d.openNow}
          value={openTotal}
          meta={oldest ? d.oldestWaiting(formatTime(oldest)) : d.openNoneNow}
        />
      </KpiRow>

      {/* Collapses to a single line when nothing is below its threshold, which
          on a well-run shop is most days. The room it used to hold open for
          that is what the panel below now occupies. */}
      <StockAlerts alerts={alerts.data ?? []} />

      <div className="staff-section">
        <TopItems
          rows={top.data}
          days={TOP_ITEMS_DAYS}
          loading={top.loading}
          errorCode={top.errorCode}
          onRetry={() => top.reload()}
        />
      </div>
    </>
  )
}
