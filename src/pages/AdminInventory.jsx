import IngredientCosts from '../components/IngredientCosts'
import PageHead from '../components/PageHead'
import StaffError from '../components/StaffError'
import StockTable from '../components/StockTable'
import { COPY } from '../content/copy'
import { fetchStockLevels } from '../api/inventory'
import { fetchInventoryValue } from '../api/adminInsights'
import { useAsyncData } from '../lib/useAsyncData'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/**
 * FR-7.5: the Admin sees inventory and cannot change it.
 *
 * The missing book-in form is presentation only — receive_stock() refuses
 * anyone who is not the Manager, so the Admin is blocked whether or not this
 * page offers them a control. The note says so out loud rather than leaving
 * them to wonder where it went.
 *
 * WHAT THE ADMIN CAN CHANGE HERE IS THE PRICE. Stock levels are the Manager's;
 * what the shop pays its suppliers is not. That one column is also the
 * foundation of four other reports — cost of goods, margin per pizza, the
 * product mix and this page's own valuation — which is why it lives on the
 * screen where the ingredients already are, rather than in a settings page
 * nobody would find.
 */
export default function AdminInventory() {
  const t = COPY.staff
  useDocumentTitle(`${t.pages.inventoryTitle} · ${t.adminTitle}`)

  const levels = useAsyncData(async () => {
    const { rows, errorCode } = await fetchStockLevels()
    return { data: rows, errorCode }
  })

  const costs = useAsyncData(async () => {
    const { rows, errorCode } = await fetchInventoryValue()
    return { data: rows, errorCode }
  })

  const reloadAll = () => {
    levels.reload({ silent: true })
    costs.reload({ silent: true })
  }

  return (
    <>
      <PageHead title={t.pages.inventoryTitle} subtitle={t.pages.inventorySub} />
      <p className="staff-readonly">{t.inventory.readOnlyNote}</p>

      {(levels.loading || costs.loading) && <p aria-busy="true">{t.stock.loading}</p>}

      {!levels.loading && levels.errorCode && (
        <StaffError code={levels.errorCode} messages={t.stock.errors} onRetry={levels.reload} />
      )}

      {!costs.loading && !costs.errorCode && costs.data && (
        <IngredientCosts rows={costs.data} onSaved={reloadAll} />
      )}

      {!levels.loading && !levels.errorCode && levels.data && <StockTable rows={levels.data} />}
    </>
  )
}
