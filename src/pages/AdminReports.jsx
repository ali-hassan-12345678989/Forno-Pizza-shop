import PageHead from '../components/PageHead'
import SalesReport from '../components/SalesReport'
import { COPY } from '../content/copy'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/**
 * FR-7.4: daily, monthly and yearly.
 *
 * The three groupings are tabs inside this one section — three related views
 * of the same table, which is what tabs are for. They are deliberately the
 * only tabs in either panel.
 */
export default function AdminReports() {
  const t = COPY.staff
  useDocumentTitle(`${t.pages.reportsTitle} · ${t.adminTitle}`)

  return (
    <>
      <PageHead title={t.pages.reportsTitle} subtitle={t.pages.reportsSub} />
      <SalesReport />
    </>
  )
}
