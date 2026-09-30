import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHead from '../components/PageHead'
import RangePicker from '../components/RangePicker'
import StaffError from '../components/StaffError'
import UsageTable from '../components/UsageTable'
import { COPY } from '../content/copy'
import { SHOP_TIME_ZONE } from '../config/usage'
import { DEFAULT_RANGE, RANGE_IDS, isValidRange, rangeFor } from '../lib/dateRanges'
import { fetchUsageBetween } from '../api/usage'
import { formatPeriod } from '../lib/format'
import { shopDayKey } from '../lib/shopDays'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { STAFF_ROLES } from '../config/staff'
import { useStaff } from '../context/StaffContext'

/**
 * What the kitchen has got through — the same screen for both roles.
 *
 * One component rather than a Manager copy and an Admin copy, because it is
 * genuinely one screen: staff_usage_between() admits both roles and returns
 * them the same rows. Two files would be two places for the same table to drift
 * apart, and the panel title is the only thing that actually differs.
 *
 * The window is owned here rather than inside the table, because it is what
 * decides which request goes out — the table renders whatever came back and has
 * no opinion about which dates produced it.
 */
export default function StaffUsage() {
  const t = COPY.staff
  const { role } = useStaff()

  useDocumentTitle(
    `${t.pages.usageTitle} · ${role === STAFF_ROLES.admin ? t.adminTitle : t.managerTitle}`,
  )

  const today = useMemo(() => shopDayKey(new Date(), SHOP_TIME_ZONE), [])

  const [preset, setPreset] = useState(DEFAULT_RANGE)
  const [range, setRange] = useState(() => rangeFor(DEFAULT_RANGE, today))
  const [rows, setRows] = useState(null)
  const [errorCode, setErrorCode] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (from, to) => {
    setLoading(true)
    setErrorCode(null)
    const { rows: data, errorCode: code } = await fetchUsageBetween(from, to)
    setRows(data)
    setErrorCode(code)
    setLoading(false)
  }, [])

  /* Only ever fires for a window the database would accept. A half-typed custom
     date is not a request worth sending — it would come back as invalid_range
     and replace a perfectly good table with an error while somebody was still
     typing the second date. */
  useEffect(() => {
    if (!isValidRange(range.from, range.to)) return
    load(range.from, range.to)
  }, [load, range.from, range.to])

  function choosePreset(id) {
    setPreset(id)
    // Custom starts from whatever window is already on screen rather than from
    // blank, so refining "last 7 days" by a day is one edit and not two.
    if (id !== RANGE_IDS.custom) setRange(rangeFor(id, today))
  }

  function chooseCustom(from, to) {
    setPreset(RANGE_IDS.custom)
    setRange({ from, to })
  }

  const rangeLabel =
    range.from === range.to
      ? formatPeriod(range.from, 'day')
      : t.ranges.spanned(formatPeriod(range.from, 'day'), formatPeriod(range.to, 'day'))

  return (
    <>
      <PageHead title={t.pages.usageTitle} subtitle={t.pages.usageSub} />

      <RangePicker
        value={preset}
        from={range.from}
        to={range.to}
        onPreset={choosePreset}
        onCustom={chooseCustom}
      />

      {loading && <p aria-busy="true">{t.usage.loading}</p>}
      {!loading && errorCode && (
        <StaffError
          code={errorCode}
          messages={t.usage.errors}
          onRetry={() => load(range.from, range.to)}
        />
      )}

      {!loading && !errorCode && rows && <UsageTable rows={rows} rangeLabel={rangeLabel} />}
    </>
  )
}
