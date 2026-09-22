import PageHead from '../components/PageHead'
import ReceiveStock from '../components/ReceiveStock'
import StaffError from '../components/StaffError'
import StockTable from '../components/StockTable'
import { COPY } from '../content/copy'
import { fetchStockLevels } from '../api/inventory'
import { useAsyncData } from '../lib/useAsyncData'
import { useDeliverySheet } from '../lib/useDeliverySheet'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/**
 * FR-6.3 stock levels and FR-6.2 booking in a delivery, on one screen because
 * they are one job: you look at what is short, then you order it.
 *
 * The sheet lives here rather than inside either half, because both halves put
 * lines on it — the table's own rows and the picker underneath — and the table
 * has to grey out what is already queued.
 */
export default function ManagerStock() {
  const t = COPY.staff
  useDocumentTitle(`${t.pages.stockTitle} · ${t.managerTitle}`)

  const { sheet, queuedIds, onBookIn } = useDeliverySheet()

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
      <PageHead
        title={t.pages.stockTitle}
        subtitle={rows ? t.pages.stockSub(rows.length) : undefined}
      />

      {loading && <p aria-busy="true">{t.stock.loading}</p>}
      {!loading && errorCode && (
        <StaffError code={errorCode} messages={t.stock.errors} onRetry={reload} />
      )}

      {!loading && !errorCode && rows && (
        <div className="staff-split">
          <StockTable rows={rows} onBookIn={onBookIn} queuedIds={queuedIds} />

          {/* A silent reload keeps the sheet mounted, so its confirmation
              survives the table refreshing beside it. */}
          <ReceiveStock
            ingredients={rows}
            {...sheet}
            fromTable
            onSaved={() => reload({ silent: true })}
          />
        </div>
      )}
    </>
  )
}
