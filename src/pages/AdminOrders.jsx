import { useEffect, useRef, useState } from 'react'
import AdminOrderList from '../components/AdminOrderList'
import PageHead from '../components/PageHead'
import StaffError from '../components/StaffError'
import { COPY } from '../content/copy'
import { fetchAdminOrders } from '../api/adminOrders'
import { SEARCH_DEBOUNCE_MS } from '../config/adminOrders'
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
 *
 * WHY THE SEARCH TRAVELS. The owner asked to find an order by the phone number
 * a customer reads out. This list has never carried a phone number and still
 * does not: admin_orders() matches it server-side and does not return it, so
 * the screen stays free of contact details and a screenshot of it still leaks
 * nothing. The cost is a round trip, so the typing is debounced rather than
 * sent on every keystroke.
 */
export default function AdminOrders() {
  const t = COPY.staff
  useDocumentTitle(`${t.pages.ordersTitle} · ${t.adminTitle}`)

  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setSearch(query.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [query])

  const {
    data: orders,
    errorCode,
    loading,
    reload,
  } = useAsyncData(async () => {
    const { orders: data, errorCode: code } = await fetchAdminOrders(undefined, search)
    return { data, errorCode: code }
  })

  /* useAsyncData loads once on mount and re-reads its loader on every reload,
     so a changed search only needs to ask again. The ref skips the first run:
     without it, arriving on this page would fire the same request twice, which
     is exactly the waste the fourth audit spent a finding on. */
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    reload()
  }, [search, reload])

  /* Two staff can be looking at the same order; one of them pressing a button
     must not leave the other reading a stage it has left. Silent, so a poll
     landing mid-search does not blink the list away under the cursor. */
  useAutoRefresh(() => reload({ silent: true }), STAFF_POLL_MS)

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

      {!loading && !errorCode && orders && (
        <AdminOrderList orders={orders} query={query} onQuery={setQuery} />
      )}
    </>
  )
}
