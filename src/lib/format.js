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
