import { useState } from 'react'
import PageHead from '../components/PageHead'
import ReceiveStock from '../components/ReceiveStock'
import StaffError from '../components/StaffError'
import StockCount from '../components/StockCount'
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
 *
 * This screen is also where the dashboard's delivery sheet went. The owner's
 * review called that out: a dashboard is read at a glance and this is a form
 * filled in with a delivery note in one hand, and the two were competing for
 * the same first screen. Here the sheet sits beside the shelf it is changing.
 *
 * Counting is the third thing that happens at a shelf, and it is the only one
 * that can tell the Manager anything the recipes cannot — see StockCount.
 */
export default function ManagerStock() {
  const t = COPY.staff
  useDocumentTitle(`${t.pages.stockTitle} · ${t.managerTitle}`)

  const { sheet, queuedIds, quantities, onBookIn, onBulkQuantity } = useDeliverySheet()

  /* Held by the page rather than the table, because the sheet beside it changes
     its wording to match — a delivery typed down a column and one added row by
     row are the same delivery, and the panel should not describe it two ways. */
  const [bulk, setBulk] = useState(false)

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
          <StockTable
            rows={rows}
            onBookIn={onBookIn}
            queuedIds={queuedIds}
            quantities={quantities}
            onBulkQuantity={onBulkQuantity}
            bulk={bulk}
            onBulkChange={setBulk}
          />

          <div className="stock-side">
            {/* A silent reload keeps the sheet mounted, so its confirmation
                survives the table refreshing beside it. */}
            <ReceiveStock
              ingredients={rows}
              {...sheet}
              fromTable
              bulk={bulk}
              onSaved={() => reload({ silent: true })}
            />

            <StockCount ingredients={rows} onSaved={() => reload({ silent: true })} />
          </div>
        </div>
      )}
    </>
  )
}
