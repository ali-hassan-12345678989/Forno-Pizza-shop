import { COPY } from '../content/copy'
import { formatDateTime } from '../lib/format'
import './ActiveOrders.css'

/**
 * Open orders, grouped by stage. Purely a renderer — which orders count as
 * open is decided by order_is_active() in Postgres, which reads the terminal
 * status off the end of order_status_flow().
 *
 * Stage names come from COPY.track.statuses, the same words the customer reads
 * on their own tracking page. Two vocabularies for one ladder would be a
 * support call waiting to happen.
 */
export default function ActiveOrdersTable({ groups }) {
  const t = COPY.staff.active

  if (groups.length === 0) return <p className="aorders-none">{t.none}</p>

  return (
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
  )
}
