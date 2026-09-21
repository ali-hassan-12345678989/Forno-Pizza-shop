import { useCallback, useEffect, useState } from 'react'
import StaffShell from '../components/StaffShell'
import StockAlerts from '../components/StockAlerts'
import StockTable from '../components/StockTable'
import ReceiveStock from '../components/ReceiveStock'
import SalesReport from '../components/SalesReport'
import { COPY } from '../content/copy'
import { fetchStockAlerts, fetchStockLevels } from '../api/inventory'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/**
 * FR-6.1 the Manager's own view, FR-6.3 stock levels, FR-6.2 booking in a
 * delivery, FR-5.4 the low-stock alerts. Sales reports follow in task 6.
 *
 * Alerts come first on the page: they are the only thing here that needs
 * acting on today.
 */
export default function ManagerPanel() {
  const t = COPY.staff
  useDocumentTitle(t.managerDocumentTitle)

  const [rows, setRows] = useState(null)
  const [alerts, setAlerts] = useState(null)
  const [errorCode, setErrorCode] = useState(null)
  const [loading, setLoading] = useState(true)

  /**
   * `silent` reloads leave the form mounted.
   *
   * Booking in a delivery refreshes this data, and a noisy reload tore the
   * ReceiveStock component down mid-confirmation — React unmounts it, its
   * state goes with it, and the "Added 25 g to Beef Strips" message the
   * Manager needs to see never renders. The stock moved; they had no way
   * to tell.
   *
   * Both are refetched together because a delivery can close an alert: the
   * table and the alert list describe the same numbers, and showing one
   * refreshed beside the other stale would be worse than showing neither.
   */
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setErrorCode(null)

    const [stock, alertList] = await Promise.all([fetchStockLevels(), fetchStockAlerts()])

    setRows(stock.rows)
    setAlerts(alertList.alerts)
    setErrorCode(stock.errorCode ?? alertList.errorCode)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const ready = !loading && !errorCode && rows && alerts

  return (
    <StaffShell title={t.managerTitle} subtitle={t.managerSub}>
      {loading && <p aria-busy="true">{t.stock.loading}</p>}

      {!loading && errorCode && (
        <div className="form-alert" role="alert">
          <p>{t.stock.errors[errorCode] ?? t.stock.errors.unknown}</p>
          <button type="button" className="btn-ghost" onClick={() => load()}>
            {t.stock.retry}
          </button>
        </div>
      )}

      {ready && (
        <>
          <StockAlerts alerts={alerts} />
          <ReceiveStock ingredients={rows} onReceived={() => load({ silent: true })} />
          <StockTable rows={rows} />
          {/* FR-6.4: sales beside stock, so the Manager can reconcile the two
              on one screen - which is the entire point of the requirement. */}
          <SalesReport />
        </>
      )}
    </StaffShell>
  )
}
