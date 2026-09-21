import { useCallback, useEffect, useMemo, useState } from 'react'
import { COPY } from '../content/copy'
import { fetchActiveOrders } from '../api/activeOrders'
import { formatDateTime } from '../lib/format'
import './ActiveOrders.css'

/**
 * FR-7.3: how many orders are open right now, so the Admin can gauge load.
 *
 * Which orders count is decided by order_is_active() in Postgres, which reads
 * the terminal status off the end of order_status_flow(). Nothing here holds
 * its own list of finished statuses — one that drifted would quietly mis-state
 * how busy the shop is, and nobody would notice until it mattered.
 *
 * Stage names come from COPY.track.statuses, the same words the customer sees
 * on their tracking page. Two vocabularies for one ladder would be a support
 * call waiting to happen.
 */
export default function ActiveOrders() {
  const t = COPY.staff.active

  const [groups, setGroups] = useState(null)
  const [errorCode, setErrorCode] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setErrorCode(null)
    const { groups: next, errorCode: code } = await fetchActiveOrders()
    setGroups(next)
    setErrorCode(code)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const total = useMemo(() => (groups ?? []).reduce((a, g) => a + g.count, 0), [groups])

  return (
    <section className="aorders" aria-labelledby="aorders-title">
      <div className="aorders-head">
        <h2 id="aorders-title">{t.title}</h2>
        {groups && groups.length > 0 && <span className="aorders-total">{t.total(total)}</span>}
      </div>

      {loading && <p aria-busy="true">{t.loading}</p>}

      {!loading && errorCode && (
        <div className="form-alert" role="alert">
          <p>{t.errors[errorCode] ?? t.errors.unknown}</p>
          <button type="button" className="btn-ghost" onClick={load}>
            {t.retry}
          </button>
        </div>
      )}

      {!loading && !errorCode && groups && groups.length === 0 && (
        <p className="aorders-none">{t.none}</p>
      )}

      {!loading && !errorCode && groups && groups.length > 0 && (
        <div className="aorders-scroll">
          <table className="aorders-table">
            <thead>
              <tr>
                <th scope="col">{t.colStatus}</th>
                <th scope="col">{t.colType}</th>
                <th scope="col" className="num">
                  {t.colCount}
                </th>
                <th scope="col">{t.colOldest}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={`${g.status}-${g.fulfillmentType}`}>
                  <th scope="row">{COPY.track.statuses[g.status] ?? g.status}</th>
                  <td>{t.types[g.fulfillmentType] ?? g.fulfillmentType}</td>
                  <td className="num">{g.count}</td>
                  <td className="muted">{formatDateTime(g.oldestAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
