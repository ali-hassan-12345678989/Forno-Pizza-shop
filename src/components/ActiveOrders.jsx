import { useMemo } from 'react'
import ActiveOrdersTable from './ActiveOrdersTable'
import StaffError from './StaffError'
import { COPY } from '../content/copy'
import { fetchActiveOrders } from '../api/activeOrders'
import { useAsyncData } from '../lib/useAsyncData'
import './ActiveOrders.css'

/**
 * FR-7.3: how many orders are open right now, so staff can gauge load.
 * Loads its own data; the table beside it is presentational, so a page that
 * already has the groups can render that directly instead of fetching twice.
 */
export default function ActiveOrders() {
  const t = COPY.staff.active

  const {
    data: groups,
    errorCode,
    loading,
    reload,
  } = useAsyncData(async () => {
    const { groups: data, errorCode: code } = await fetchActiveOrders()
    return { data, errorCode: code }
  })

  const total = useMemo(() => (groups ?? []).reduce((sum, g) => sum + g.count, 0), [groups])

  return (
    <section className="aorders" aria-labelledby="aorders-title">
      <div className="aorders-head">
        <h2 id="aorders-title">{t.title}</h2>
        {groups && groups.length > 0 && <span className="aorders-total">{t.total(total)}</span>}
      </div>

      {loading && <p aria-busy="true">{t.loading}</p>}
      {!loading && errorCode && (
        <StaffError code={errorCode} messages={t.errors} onRetry={reload} />
      )}
      {!loading && !errorCode && groups && <ActiveOrdersTable groups={groups} />}
    </section>
  )
}
