import { Link } from 'react-router-dom'
import ActiveOrdersTable from '../components/ActiveOrdersTable'
import { Kpi, KpiRow } from '../components/Kpi'
import PageHead from '../components/PageHead'
import Sparkline from '../components/Sparkline'
import StaffError from '../components/StaffError'
import { COPY } from '../content/copy'
import { REPORT_PERIODS, SHOP_TIME_ZONE } from '../config/reports'
import { STAFF_ROLES } from '../config/staff'
import { SECTION_IDS, pathTo } from '../config/staffNav'
import { fetchActiveOrders } from '../api/activeOrders'
import { fetchAdminMenu } from '../api/adminMenu'
import { fetchStockLevels } from '../api/inventory'
import { fetchAdminOrders } from '../api/adminOrders'
import { fetchSalesTargets } from '../api/adminInsights'
import { fetchSalesReport } from '../api/reports'
import SlaWire from '../components/SlaWire'
import { useShop } from '../context/SettingsContext'
import { weekdayOf } from '../lib/shopDays'
import { formatPrice, formatShopDate, formatTime } from '../lib/format'
import { shopDayKey } from '../lib/shopDays'
import { STAFF_POLL_MS } from '../config/staffPoll'
import { useAsyncData } from '../lib/useAsyncData'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/** How many days the dashboard's trend line covers. */
const TREND_DAYS = 7

/**
 * The Admin's first screen: what is happening now, and how the shop is doing.
 *
 * The menu count comes from admin_menu_items() rather than the customer menu,
 * because the Admin needs to know about the items customers cannot see — a
 * hidden item is exactly the one most likely to need attention.
 */
export default function AdminDashboard() {
  const t = COPY.staff
  const d = t.dashboard
  useDocumentTitle(`${d.adminTitle} · ${t.adminTitle}`)

  /* The deadline the wire judges against is the shop's own promise — the ETA
     text printed on the menu — not a number kept in the code. */
  const shop = useShop()

  const open = useAsyncData(async () => {
    const { groups, errorCode } = await fetchActiveOrders()
    return { data: groups, errorCode }
  })

  const sales = useAsyncData(async () => {
    const { rows, errorCode } = await fetchSalesReport(REPORT_PERIODS.day, TREND_DAYS)
    return { data: rows, errorCode }
  })

  /* Only the open-order count. Sales and the menu move on a scale of days, and
     re-fetching them every ten seconds would be three times the requests to
     watch two numbers that cannot have changed. */
  useAutoRefresh(open.reload, STAFF_POLL_MS)

  const menu = useAsyncData(async () => {
    const { items, errorCode } = await fetchAdminMenu()
    return { data: items, errorCode }
  })

  const stock = useAsyncData(async () => {
    const { rows, errorCode } = await fetchStockLevels()
    return { data: rows, errorCode }
  })

  /* The individual orders, for the exception wire. fetchActiveOrders() above
     returns them GROUPED by status, which is right for "how busy are we" and
     useless for "which one is late" — a group has no placed-at to measure. */
  const orders = useAsyncData(async () => {
    const { orders: rows, errorCode } = await fetchAdminOrders()
    return { data: rows, errorCode }
  })

  useAutoRefresh(orders.reload, STAFF_POLL_MS)

  const targets = useAsyncData(async () => {
    const { rows, errorCode } = await fetchSalesTargets()
    return { data: rows, errorCode }
  })

  /* Neither the order list nor the targets are in the blocking pair.
     The four figures above are the pulse; the wire and the target are context
     on top of them, and one slow read should not replace a working dashboard
     with a retry button. The wire simply does not draw without its orders. */
  const loading = open.loading || sales.loading || menu.loading || stock.loading
  const errorCode = open.errorCode ?? sales.errorCode ?? menu.errorCode ?? stock.errorCode

  const reloadAll = () => {
    open.reload()
    sales.reload()
    menu.reload()
    stock.reload()
    orders.reload()
    targets.reload()
  }

  if (loading) return <p aria-busy="true">{d.loading}</p>
  if (errorCode) {
    return <StaffError code={errorCode} messages={t.menu.errors} onRetry={reloadAll} />
  }

  const groups = open.data ?? []
  const openTotal = groups.reduce((sum, g) => sum + g.count, 0)
  const oldest = groups[0]?.oldestAt

  /* The first row is the most recent day the shop TOOK AN ORDER, which is not
     the same thing as today — sales_report() groups orders, so a day with none
     produces no bucket at all. Reading row zero as today meant that on a quiet
     morning both dashboards showed yesterday's takings under the words "today",
     with no hint the figure was a day old. Confirmed on the live site: the
     panel read "Orders today 6 · Rs. 7050" while the sales table underneath
     attributed those exact figures to the previous day.
     Comparing the bucket's own date against the shop's date is the fix; the
     shop's zone is what decides, because that is the zone sales_report()
     bucketed by. */
  const today = shopDayKey(new Date(), SHOP_TIME_ZONE)
  const todayBucket = sales.data?.[0]?.periodStart === today ? sales.data[0] : null
  const trend = [...(sales.data ?? [])].reverse()

  const items = menu.data ?? []
  const hidden = items.filter((i) => !i.isActive).length
  // Two different reasons an item is unavailable, both worth counting: pulled
  // by hand, or the inventory engine found an ingredient at zero.
  const unavailable = items.filter((i) => i.isActive && (i.isSoldOut || i.outOfStock)).length
  const live = items.filter((i) => i.isActive && !i.isSoldOut && !i.outOfStock).length

  const lowCount = (stock.data ?? []).filter((r) => r.isLow).length

  /* Today's target, from the seven weekly ones. A target per calendar date is a
     spreadsheet somebody has to keep filling in; a target per weekday is set
     once and keeps working, which is the same reason the Manager's dashboard
     compares against the same weekday. */
  const todayTarget =
    (targets.data ?? []).find((row) => row.dayOfWeek === weekdayOf(today))?.target ?? null
  const takenToday = todayBucket ? todayBucket.revenue : 0

  const targetMeta = () => {
    if (todayTarget === null)
      return todayBucket ? d.goodsOf(formatPrice(todayBucket.goodsRevenue)) : d.noOrdersYet
    if (todayTarget === 0) return d.targetNone
    return d.targetProgress(Math.round((takenToday / todayTarget) * 100), formatPrice(todayTarget))
  }

  return (
    <>
      <PageHead
        title={d.adminTitle}
        subtitle={d.subtitle(formatShopDate(new Date(), SHOP_TIME_ZONE))}
      >
        <Link className="btn-ghost" to={pathTo(STAFF_ROLES.admin, SECTION_IDS.orders)}>
          {d.seeAllOrders}
        </Link>
      </PageHead>

      <KpiRow>
        <Kpi
          label={d.openNow}
          value={openTotal}
          tone={openTotal > 0 ? 'attention' : undefined}
          meta={oldest ? d.oldestWaiting(formatTime(oldest)) : d.openNoneNow}
        />
        <Kpi
          label={d.revenueToday}
          value={formatPrice(takenToday)}
          meta={targetMeta()}
          /* Only once there is a target to miss. Amber on a day nobody set an
             expectation for would be the dashboard inventing a problem. */
          tone={
            todayTarget !== null && todayTarget > 0 && takenToday < todayTarget
              ? 'attention'
              : undefined
          }
        />
        <Kpi label={d.liveOnMenu} value={live} meta={d.menuBreakdown(hidden, unavailable)} />
        <Kpi
          label={d.stockProblems}
          value={lowCount}
          tone={lowCount > 0 ? 'attention' : undefined}
          meta={lowCount > 0 ? undefined : d.stockProblemsNone}
        />
      </KpiRow>

      {/* Only drawn when something is actually past its promise — see SlaWire.
          A permanent panel reading "0 late" is a panel people stop seeing,
          which is the failure this is meant to prevent. */}
      <SlaWire orders={orders.data} settings={shop} />

      <section className="staff-section aorders" aria-labelledby="dash-open-title">
        <div className="aorders-head">
          <h2 id="dash-open-title">{COPY.staff.active.title}</h2>
          {groups.length > 0 && (
            <span className="aorders-total">{COPY.staff.active.total(openTotal)}</span>
          )}
        </div>
        <ActiveOrdersTable groups={groups} />
      </section>

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
