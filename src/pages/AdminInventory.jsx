import PageHead from '../components/PageHead'
import StaffError from '../components/StaffError'
import StockTable from '../components/StockTable'
import { COPY } from '../content/copy'
import { fetchStockLevels } from '../api/inventory'
import { useAsyncData } from '../lib/useAsyncData'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/**
 * FR-7.5: the Admin sees inventory and cannot change it.
 *
 * The missing book-in form is presentation only — receive_stock() refuses
 * anyone who is not the Manager, so the Admin is blocked whether or not this
 * page offers them a control. The note says so out loud rather than leaving
 * them to wonder where it went.
 */
export default function AdminInventory() {
  const t = COPY.staff
  useDocumentTitle(`${t.pages.inventoryTitle} · ${t.adminTitle}`)

  const {
    data: rows,
    errorCode,
    loading,
    reload,
  } = useAsyncData(async () => {
    const { rows: data, errorCode: code } = await fetchStockLevels()
    return { data, errorCode: code }
  })

  return (
    <>
      <PageHead title={t.pages.inventoryTitle} subtitle={t.pages.inventorySub} />
      <p className="staff-readonly">{t.inventory.readOnlyNote}</p>

      {loading && <p aria-busy="true">{t.stock.loading}</p>}
      {!loading && errorCode && (
        <StaffError code={errorCode} messages={t.stock.errors} onRetry={reload} />
      )}
      {!loading && !errorCode && rows && <StockTable rows={rows} />}
    </>
  )
}
