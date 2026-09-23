import PageHead from '../components/PageHead'
import ChefOrders from '../components/ChefOrders'
import StaffError from '../components/StaffError'
import { COPY } from '../content/copy'
import { STAFF_POLL_MS } from '../config/staffPoll'
import { fetchChefOrders } from '../api/chef'
import { useAsyncData } from '../lib/useAsyncData'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/**
 * The kitchen's whole panel: one screen, one job.
 *
 * It refreshes itself every ten seconds and whenever the tab is looked at
 * again, so an order placed by a customer appears without anyone pressing
 * anything — and an order the Admin moved stops showing the stage it has left.
 */
export default function ChefKitchen() {
  const t = COPY.staff.chef
  useDocumentTitle(`${t.title} · ${t.panelTitle}`)

  const {
    data: orders,
    errorCode,
    loading,
    reload,
  } = useAsyncData(async () => {
    const { orders: data, errorCode: code } = await fetchChefOrders()
    return { data, errorCode: code }
  })

  useAutoRefresh(reload, STAFF_POLL_MS)

  return (
    <>
      <PageHead title={t.title} subtitle={t.sub} />

      {loading && <p aria-busy="true">{t.loading}</p>}
      {!loading && errorCode && (
        <StaffError code={errorCode} messages={t.loadErrors} onRetry={reload} />
      )}

      {!loading && !errorCode && orders && (
        <ChefOrders orders={orders} onChanged={() => reload({ silent: true })} />
      )}
    </>
  )
}
