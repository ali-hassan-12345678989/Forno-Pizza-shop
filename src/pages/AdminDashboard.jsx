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
import { fetchSalesReport } from '../api/reports'
import { formatPrice, formatShopDate, formatTime } from '../lib/format'
import { useAsyncData } from '../lib/useAsyncData'
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

  const open = useAsyncData(async () => {
    const { groups, errorCode } = await fetchActiveOrders()
    return { data: groups, errorCode }
  })

  const sales = useAsyncData(async () => {
    const { rows, errorCode } = await fetchSalesReport(REPORT_PERIODS.day, TREND_DAYS)
    return { data: rows, errorCode }
  })

  const menu = useAsyncData(async () => {
    const { items, errorCode } = await fetchAdminMenu()
    return { data: items, errorCode }
  })

  const stock = useAsyncData(async () => {
    const { rows, errorCode } = await fetchStockLevels()
    return { data: rows, errorCode }
  })

  const loading = open.loading || sales.loading || menu.loading || stock.loading
  const errorCode = open.errorCode ?? sales.errorCode ?? menu.errorCode ?? stock.errorCode

  const reloadAll = () => {
    open.reload()
    sales.reload()
    menu.reload()
    stock.reload()
  }

  if (loading) return <p aria-busy="true">{d.loading}</p>
  if (errorCode) {
    return <StaffError code={errorCode} messages={t.menu.errors} onRetry={reloadAll} />
  }

  const groups = open.data ?? []
  const openTotal = groups.reduce((sum, g) => sum + g.count, 0)
  const oldest = groups[0]?.oldestAt

  const todayBucket = sales.data?.[0]
  const trend = [...(sales.data ?? [])].reverse()

  const items = menu.data ?? []
  const hidden = items.filter((i) => !i.isActive).length
  // Two different reasons an item is unavailable, both worth counting: pulled
  // by hand, or the inventory engine found an ingredient at zero.
  const unavailable = items.filter((i) => i.isActive && (i.isSoldOut || i.outOfStock)).length
  const live = items.filter((i) => i.isActive && !i.isSoldOut && !i.outOfStock).length

  const lowCount = (stock.data ?? []).filter((r) => r.isLow).length

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
          value={formatPrice(todayBucket ? todayBucket.revenue : 0)}
          meta={todayBucket ? d.goodsOf(formatPrice(todayBucket.goodsRevenue)) : d.noOrdersYet}
        />
        <Kpi label={d.liveOnMenu} value={live} meta={d.menuBreakdown(hidden, unavailable)} />
        <Kpi
          label={d.stockProblems}
          value={lowCount}
          tone={lowCount > 0 ? 'attention' : undefined}
          meta={lowCount > 0 ? undefined : d.stockProblemsNone}
        />
      </KpiRow>

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
