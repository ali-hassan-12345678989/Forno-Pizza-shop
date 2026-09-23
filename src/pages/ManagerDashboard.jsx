import { Link } from 'react-router-dom'
import { Kpi, KpiRow } from '../components/Kpi'
import PageHead from '../components/PageHead'
import ReceiveStock from '../components/ReceiveStock'
import Sparkline from '../components/Sparkline'
import StaffError from '../components/StaffError'
import StockAlerts from '../components/StockAlerts'
import { COPY } from '../content/copy'
import { REPORT_PERIODS, SHOP_TIME_ZONE } from '../config/reports'
import { SECTION_IDS, pathTo } from '../config/staffNav'
import { STAFF_ROLES } from '../config/staff'
import { fetchStockAlerts, fetchStockLevels } from '../api/inventory'
import { fetchActiveOrders } from '../api/activeOrders'
import { fetchSalesReport } from '../api/reports'
import { formatPrice, formatShopDate, formatTime } from '../lib/format'
import { STAFF_POLL_MS } from '../config/staffPoll'
import { useAsyncData } from '../lib/useAsyncData'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { useDeliverySheet } from '../lib/useDeliverySheet'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/** How many days the dashboard's trend line covers. */
const TREND_DAYS = 7

/**
 * The Manager's first screen: is anything wrong, and how is today going.
 *
 * Everything here already existed as a separate block on the old single page.
 * What is new is the ordering — the number somebody has to act on is the
 * largest thing on screen, and the rest is context beneath it.
 *
 * All four figures come from functions the database already exposes; nothing
 * is recomputed in the browser from raw rows it should not be able to see.
 */
export default function ManagerDashboard() {
  const t = COPY.staff
  const d = t.dashboard
  useDocumentTitle(`${d.managerTitle} · ${t.managerTitle}`)

  const { sheet } = useDeliverySheet()

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

  const loading = stock.loading || alerts.loading || sales.loading || open.loading
  const errorCode = stock.errorCode ?? alerts.errorCode ?? sales.errorCode ?? open.errorCode

  const reloadAll = (opts) => {
    stock.reload(opts)
    alerts.reload(opts)
    sales.reload(opts)
    open.reload(opts)
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
  // shop has taken an order today. No orders yet means no bucket at all.
  const trend = [...(sales.data ?? [])].reverse()
  const todayBucket = sales.data?.[0]
  const openGroups = open.data ?? []
  const openTotal = openGroups.reduce((sum, g) => sum + g.count, 0)
  const oldest = openGroups[0]?.oldestAt

  return (
    <>
      <PageHead
        title={d.managerTitle}
        subtitle={d.subtitle(formatShopDate(new Date(), SHOP_TIME_ZONE))}
      >
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
          meta={todayBucket ? undefined : d.noOrdersYet}
        />
        <Kpi
          label={d.revenueToday}
          value={formatPrice(todayBucket ? todayBucket.revenue : 0)}
          meta={todayBucket ? d.goodsOf(formatPrice(todayBucket.goodsRevenue)) : undefined}
        />
        <Kpi
          label={d.openNow}
          value={openTotal}
          meta={oldest ? d.oldestWaiting(formatTime(oldest)) : d.openNoneNow}
        />
      </KpiRow>

      <div className="staff-section">
        <StockAlerts alerts={alerts.data ?? []} />
      </div>

      <div className="staff-section">
        {/* The same sheet the stock section uses. There is no table to pick
            from here, so lines are added with its own search field. */}
        <ReceiveStock ingredients={rows} {...sheet} onSaved={() => reloadAll({ silent: true })} />
      </div>

      {trend.length > 1 && (
        <div className="staff-section panel">
          <h2 className="staff-panel-title">{d.weekTitle}</h2>
          <p className="staff-note">{d.weekSub}</p>
          <Sparkline
            points={trend.map((r) => r.orders)}
            label={d.weekAria(
              Math.min(...trend.map((r) => r.orders)),
              Math.max(...trend.map((r) => r.orders)),
            )}
          />
        </div>
      )}
    </>
  )
}
