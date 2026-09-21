import { useCallback, useEffect, useState } from 'react'
import StaffShell from '../components/StaffShell'
import ActiveOrders from '../components/ActiveOrders'
import AdminMenu from '../components/AdminMenu'
import SalesReport from '../components/SalesReport'
import StockTable from '../components/StockTable'
import { COPY } from '../content/copy'
import { fetchStockLevels } from '../api/inventory'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/**
 * FR-7.1 the Admin's own view, FR-7.2 menu management, FR-7.3 open orders,
 * FR-7.4 sales, FR-7.5 inventory read-only.
 *
 * The inventory section reuses the Manager's StockTable and deliberately
 * omits ReceiveStock. That omission is presentation only — FR-7.6 is enforced
 * by receive_stock() refusing anyone who is not the Manager, so the Admin is
 * blocked whether or not this page offers them a form.
 *
 * Ordered by how immediate each thing is: what is happening now, then what
 * the shop sells, then what it has, then how it has done.
 */
export default function AdminPanel() {
  const t = COPY.staff
  useDocumentTitle(t.adminDocumentTitle)

  const [stock, setStock] = useState(null)
  const [stockError, setStockError] = useState(null)

  const loadStock = useCallback(async () => {
    setStockError(null)
    const { rows, errorCode } = await fetchStockLevels()
    setStock(rows)
    setStockError(errorCode)
  }, [])

  useEffect(() => {
    loadStock()
  }, [loadStock])

  return (
    <StaffShell title={t.adminTitle} subtitle={t.adminSub}>
      <ActiveOrders />

      <AdminMenu />

      <section className="admin-inventory" aria-labelledby="admin-inv-title">
        <h2 id="admin-inv-title" className="visually-hidden">
          {t.stock.title}
        </h2>
        <p className="admin-readonly">{t.inventory.readOnlyNote}</p>

        {stockError && (
          <div className="form-alert" role="alert">
            <p>{t.stock.errors[stockError] ?? t.stock.errors.unknown}</p>
            <button type="button" className="btn-ghost" onClick={loadStock}>
              {t.stock.retry}
            </button>
          </div>
        )}

        {!stockError && !stock && <p aria-busy="true">{t.stock.loading}</p>}
        {!stockError && stock && <StockTable rows={stock} />}
      </section>

      <SalesReport />
    </StaffShell>
  )
}
