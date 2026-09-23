import AdminOrderList from '../components/AdminOrderList'
import PageHead from '../components/PageHead'
import StaffError from '../components/StaffError'
import { COPY } from '../content/copy'
import { fetchAdminOrders } from '../api/adminOrders'
import { STAFF_POLL_MS } from '../config/staffPoll'
import { useAsyncData } from '../lib/useAsyncData'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/**
 * FR-7.3, extended: the real orders, not a count of them.
 *
 * This used to render the dashboard's how-busy-are-we table, which groups the
 * orders away before they leave Postgres — useful for gauging load, useless for
 * answering "what was in #1007". That table is still on the dashboard, where
 * gauging load is the whole job.
 */
export default function AdminOrders() {
  const t = COPY.staff
  useDocumentTitle(`${t.pages.ordersTitle} · ${t.adminTitle}`)

  const {
    data: orders,
    errorCode,
    loading,
    reload,
  } = useAsyncData(async () => {
    const { orders: data, errorCode: code } = await fetchAdminOrders()
    return { data, errorCode: code }
  })

  /* Two staff can be looking at the same order; one of them pressing a button
     must not leave the other reading a stage it has left. */
  useAutoRefresh(reload, STAFF_POLL_MS)

  return (
    <>
      <PageHead
        title={t.pages.ordersTitle}
        subtitle={orders ? t.orders.countLabel(orders.length) : t.pages.ordersSub}
      />

      {loading && <p aria-busy="true">{t.orders.loading}</p>}
      {!loading && errorCode && (
        <StaffError code={errorCode} messages={t.orders.errors} onRetry={reload} />
      )}

      {!loading && !errorCode && orders && <AdminOrderList orders={orders} />}
    </>
  )
}
