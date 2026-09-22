/**
 * Pakistani price formatting, matching how Domino's PK writes it:
 * "Rs. 650", "Rs. 1800" — space after Rs., no paisa, no thousands separator.
 * Pizza Hut PK's "PKR 699.00" reads as an unlocalised import; don't copy it.
 */
export function formatPrice(amount) {
  return `Rs. ${Math.round(Number(amount))}`
}

/**
 * "7:42 pm" — how a placement time reads on a receipt here. Locale is pinned to
 * en-PK so the confirmation does not change shape with the browser's language.
 */
export function formatTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return date
    .toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase()
}

/** "15 Sep, 7:42 pm" — enough to tell two orders apart in a history list. */
export function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const day = date.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })
  return `${day}, ${formatTime(value)}`
}

/**
 * A stock reading with its unit, e.g. "40,000 g" or "12.5 kg".
 *
 * Quantities are numeric(12,3) in Postgres, so whole numbers arrive as "40000"
 * and fractions matter. Trailing zeros are dropped because "1.500 kg" reads
 * like a precision the shop does not actually measure to.
 */
export function formatQuantity(amount, unit) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  const rounded = Math.round(n * 1000) / 1000
  return `${rounded.toLocaleString('en-PK')} ${unit}`
}

/**
 * A report bucket's label: "21 Sep 2026", "September 2026" or "2026".
 *
 * sales_report() hands back a plain calendar date already cut in the shop's
 * time zone. It is split by hand rather than passed to new Date(), because
 * new Date('2026-09-21') is parsed as UTC midnight and would render as the
 * 20th for any reader west of Greenwich - relabelling a day the database was
 * perfectly clear about.
 */
export function formatPeriod(isoDate, period) {
  if (!isoDate) return '—'
  const [y, m, d] = String(isoDate).split('-').map(Number)
  if (!y) return String(isoDate)

  if (period === 'year') return String(y)

  const month = new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleDateString('en-GB', {
    month: period === 'month' ? 'long' : 'short',
    timeZone: 'UTC',
  })

  return period === 'month' ? `${month} ${y}` : `${d} ${month} ${y}`
}

/**
 * Today, written the way the shop would say it: "Tuesday 22 September".
 *
 * Formatted in the shop's own time zone rather than the reader's, so a staff
 * member checking the panel from anywhere sees the shop's day, which is also
 * the day the sales report buckets by.
 */
export function formatShopDate(date, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  }).format(date)
}
