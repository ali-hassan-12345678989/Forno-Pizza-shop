import ActiveOrders from '../components/ActiveOrders'
import PageHead from '../components/PageHead'
import { COPY } from '../content/copy'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/** FR-7.3: what is in progress right now. Finished orders live under Reports. */
export default function AdminOrders() {
  const t = COPY.staff
  useDocumentTitle(`${t.pages.ordersTitle} · ${t.adminTitle}`)

  return (
    <>
      <PageHead title={t.pages.ordersTitle} subtitle={t.pages.ordersSub} />
      <ActiveOrders />
    </>
  )
}
