import { useCallback, useEffect, useMemo, useState } from 'react'
import ExportButton from '../components/ExportButton'
import PageHead from '../components/PageHead'
import RangePicker from '../components/RangePicker'
import SalesReport from '../components/SalesReport'
import SalesTargets from '../components/SalesTargets'
import { CogsPanel, ProductMixPanel, TimingsPanel } from '../components/CostReport'
import { COPY } from '../content/copy'
import { MIX_DAYS, TIMING_DAYS } from '../config/adminInsights'
import { SHOP_TIME_ZONE } from '../config/reports'
import { DEFAULT_RANGE, RANGE_IDS, isValidRange, rangeFor } from '../lib/dateRanges'
import {
  fetchCogs,
  fetchFulfillmentTimes,
  fetchProductMix,
  fetchSalesTargets,
} from '../api/adminInsights'
import { formatPeriod } from '../lib/format'
import { shopDayKey } from '../lib/shopDays'
import { useAsyncData } from '../lib/useAsyncData'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/**
 * FR-7.4: daily, monthly and yearly — plus what all of it cost.
 *
 * The sales report above has always said what came in. Everything below it says
 * what went out, which is the half the owner's review was really asking for:
 * revenue alone cannot tell anybody whether a pizza is worth making.
 *
 * The costing window is its own control rather than following the sales tabs.
 * Daily / monthly / yearly are groupings of a table; a cost of goods figure is
 * a single sum across a period, and reconciling it against a stock count means
 * choosing the period the count covers.
 */
export default function AdminReports() {
  const t = COPY.staff
  useDocumentTitle(`${t.pages.reportsTitle} · ${t.adminTitle}`)

  const today = useMemo(() => shopDayKey(new Date(), SHOP_TIME_ZONE), [])
  const [preset, setPreset] = useState(DEFAULT_RANGE)
  const [range, setRange] = useState(() => rangeFor(DEFAULT_RANGE, today))

  const [cogs, setCogs] = useState(null)
  const [cogsError, setCogsError] = useState(null)

  const loadCogs = useCallback(async (from, to) => {
    const { cogs: data, errorCode } = await fetchCogs(from, to)
    setCogs(data)
    setCogsError(errorCode)
  }, [])

  useEffect(() => {
    if (!isValidRange(range.from, range.to)) return
    loadCogs(range.from, range.to)
  }, [loadCogs, range.from, range.to])

  const timings = useAsyncData(async () => {
    const { rows, errorCode } = await fetchFulfillmentTimes(TIMING_DAYS)
    return { data: rows, errorCode }
  })

  const mix = useAsyncData(async () => {
    const { rows, errorCode } = await fetchProductMix(MIX_DAYS)
    return { data: rows, errorCode }
  })

  const targets = useAsyncData(async () => {
    const { rows, errorCode } = await fetchSalesTargets()
    return { data: rows, errorCode }
  })

  function choosePreset(id) {
    setPreset(id)
    if (id !== RANGE_IDS.custom) setRange(rangeFor(id, today))
  }

  return (
    <>
      <PageHead title={t.pages.reportsTitle} subtitle={t.pages.reportsSub} />

      <SalesReport />

      <div className="staff-section">
        <h2 className="staff-panel-title">{t.pages.costingTitle}</h2>
        <p className="staff-note">{t.pages.costingSub}</p>

        <RangePicker
          value={preset}
          from={range.from}
          to={range.to}
          onPreset={choosePreset}
          onCustom={(from, to) => {
            setPreset(RANGE_IDS.custom)
            setRange({ from, to })
          }}
        />

        {cogsError ? (
          <div className="form-alert" role="alert">
            <p>{t.usage.errors[cogsError] ?? t.usage.errors.unknown}</p>
          </div>
        ) : (
          <CogsPanel cogs={cogs} />
        )}
      </div>

      <TimingsPanel rows={timings.data} days={TIMING_DAYS} />

      <div className="staff-mix-head">
        {/* Beside the table it exports, so there is never a question about
            which figures are in the file. */}
        <ExportButton
          rows={mix.data}
          filename={`forno-product-mix-${formatPeriod(today, 'day').replace(/\s+/g, '-')}.csv`}
          columns={[
            { key: 'name', header: 'Item' },
            { key: 'quantity', header: 'Sold' },
            { key: 'revenue', header: 'Revenue' },
            { key: 'foodCost', header: 'Food cost' },
            { key: 'margin', header: 'Margin' },
          ]}
        />
      </div>
      <ProductMixPanel rows={mix.data} days={MIX_DAYS} />

      {targets.data && <SalesTargets rows={targets.data} onSaved={() => targets.reload()} />}
    </>
  )
}
