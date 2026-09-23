import { Link, useParams } from 'react-router-dom'
import AdminOrderDetail from '../components/AdminOrderDetail'
import StaffError from '../components/StaffError'
import { COPY } from '../content/copy'
import { STAFF_ROLES } from '../config/staff'
import { DETAIL_PARAM, SECTION_IDS, pathTo } from '../config/staffNav'
import { fetchAdminOrderDetail } from '../api/adminOrders'
import { isUuid } from '../lib/uuid'
import { useAsyncData } from '../lib/useAsyncData'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import '../components/AdminOrders.css'

/**
 * One order on its own URL, so a support call can be answered from a link.
 *
 * Unlike the menu editor, this fetches the single order rather than the whole
 * list: an order carries lines, extras, a status trail and possibly an account,
 * and loading a hundred of those to read one would be the wrong trade.
 */
export default function AdminOrderPage() {
  const t = COPY.staff
  const td = t.orders.detail
  const params = useParams()
  const orderId = params[DETAIL_PARAM]

  const {
    data: order,
    errorCode,
    loading,
    reload,
  } = useAsyncData(async () => {
    /* A route param is whatever was typed or pasted. `where id = 'not-a-uuid'`
       raises a cast error in Postgres, which would reach the screen as a
       generic failure offering a retry that can never succeed — so a malformed
       id is answered here, as the "no such order" it actually is. */
    if (!isUuid(orderId)) return { data: null, errorCode: 'order_not_found' }

    const { order: data, errorCode: code } = await fetchAdminOrderDetail(orderId)
    return { data, errorCode: code }
  })

  useDocumentTitle(order ? `#${order.orderNumber} · ${t.adminTitle}` : t.adminTitle)

  const backToList = (
    <Link className="btn-ghost" to={pathTo(STAFF_ROLES.admin, SECTION_IDS.orders)}>
      {td.back}
    </Link>
  )

  if (loading) return <p aria-busy="true">{t.orders.loading}</p>

  /* A stale bookmark, or an order deleted since. Its own message rather than
     the generic error, because there is nothing to retry. */
  if (errorCode === 'order_not_found' || (!errorCode && !order)) {
    return (
      <div className="medit-missing">
        <h1>{td.notFoundTitle}</h1>
        <p>{td.notFoundBody}</p>
        {backToList}
      </div>
    )
  }

  if (errorCode) {
    return <StaffError code={errorCode} messages={td.errors} onRetry={reload} />
  }

  return (
    <>
      <div className="medit-top">{backToList}</div>
      <AdminOrderDetail order={order} />
    </>
  )
}
