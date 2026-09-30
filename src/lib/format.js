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
 * A stock reading with its unit, e.g. "40,000 g" or "180 pcs".
 *
 * WHOLE NUMBERS, ON PURPOSE. Quantities are numeric(12,3) in Postgres because
 * a recipe can call for a third of a litre and the arithmetic has to land
 * somewhere, but the thousandths are an artefact of that division and not a
 * measurement anybody took. The owner's review put it exactly right: a shelf
 * reading "8,000.005 g" is three digits of noise on a number the kitchen works
 * in kilos. Every unit this shop stocks — grams, millilitres, pieces — is
 * already the smallest fraction it counts in, so there is no "logical fraction"
 * below them to round to.
 *
 * The stored value is untouched. This is display only, and the arithmetic that
 * decides whether an ingredient is low still happens in Postgres against the
 * full precision.
 *
 * THE ONE CASE WORTH SPELLING OUT. A quantity that is genuinely non-zero but
 * rounds to nothing would print "0 g" — which reads as an empty shelf and is
 * the one reading a stock screen must never get wrong. It says "< 1 g" instead.
 */
export function formatQuantity(amount, unit) {
  // Number(null) is 0, which is finite — so without this a missing figure
  // prints as a confident "0 g". Harmless on a NOT NULL stock column; wrong on
  // a variance, where null means nobody counted and zero means they counted
  // and it balanced. Those must never render the same.
  if (amount === null || amount === undefined || amount === '') return '—'

  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'

  const whole = Math.round(n)
  if (whole === 0 && n !== 0) return n > 0 ? `< 1 ${unit}` : `> -1 ${unit}`

  return `${whole.toLocaleString('en-PK')} ${unit}`
}

/**
 * A difference, with its sign kept: "+240 g", "−1,150 g", "0 g".
 *
 * Used where the sign carries the meaning rather than the size — a counted
 * variance is a different fact depending on which way it points, and a bare
 * "1,150 g" beside the words "variance" leaves the reader to guess.
 *
 * A true minus sign, not a hyphen: it is the character this is, it lines up
 * with digits in a tabular-figures column, and a hyphen at the start of a
 * number is easy to lose against a table rule.
 */
export function formatSignedQuantity(amount, unit) {
  // Number(null) is 0, which is finite — so without this a missing figure
  // prints as a confident "0 g". Harmless on a NOT NULL stock column; wrong on
  // a variance, where null means nobody counted and zero means they counted
  // and it balanced. Those must never render the same.
  if (amount === null || amount === undefined || amount === '') return '—'

  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'

  const whole = Math.round(n)
  if (whole === 0) {
    if (n === 0) return `0 ${unit}`
    return n > 0 ? `< +1 ${unit}` : `> −1 ${unit}`
  }

  const sign = whole > 0 ? '+' : '−'
  return `${sign}${Math.abs(whole).toLocaleString('en-PK')} ${unit}`
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

/**
 * Just the weekday, in the shop's zone: "Wednesday".
 *
 * Used by the dashboard's pacing lines, which compare today against the same
 * day of previous weeks and need to name that day. Formatted in the shop's own
 * zone for the same reason formatShopDate is — a staff member checking from
 * elsewhere should see the shop's day, not their own.
 */
export function formatWeekday(date, timeZone) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone }).format(date)
}

/**
 * A multiple, for "5× the reorder level".
 *
 * One decimal while the number is small enough for it to mean something, and
 * none above ten — "23.4× the reorder level" is three characters of precision
 * on a fact that only needs to say "plenty". A trailing ".0" is dropped for the
 * same reason: it reads as a measurement when it is an artefact of the format.
 */
export function formatMultiple(ratio) {
  const n = Number(ratio)
  if (!Number.isFinite(n)) return '—'
  if (n >= 10) return String(Math.round(n))

  const oneDecimal = Math.round(n * 10) / 10
  return Number.isInteger(oneDecimal) ? String(oneDecimal) : oneDecimal.toFixed(1)
}
