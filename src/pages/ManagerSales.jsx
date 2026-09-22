import PageHead from '../components/PageHead'
import SalesReport from '../components/SalesReport'
import { COPY } from '../content/copy'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/**
 * FR-6.4: sales, so the Manager can reconcile takings against the stock those
 * orders consumed. The report component is shared with the Admin's Reports
 * section — one definition of what counts as a sale, not two.
 */
export default function ManagerSales() {
  const t = COPY.staff
  useDocumentTitle(`${t.pages.salesTitle} · ${t.managerTitle}`)

  return (
    <>
      <PageHead title={t.pages.salesTitle} subtitle={t.pages.salesSub} />
      <SalesReport />
    </>
  )
}
