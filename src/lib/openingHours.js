/** The shop's clock. Every day's hours are wall-clock times where the shop is. */
export const SHOP_TIME_ZONE = 'Asia/Karachi'

/**
 * Is the shop taking orders?
 *
 * A MIRROR, NOT AN AUTHORITY. shop_is_open() in Postgres decides whether an
 * order is accepted, and a trigger on the orders table enforces it — nothing
 * here can let one through. This exists so the customer is told before they
 * spend five minutes building a cart, rather than after they press the button.
 *
 * The two must agree, and `tests/opening-hours-parity.test.js` is what keeps
 * them agreeing, the same way validation-parity.test.js holds the checkout
 * rules in step with place_order(). A mirror that has drifted is worse than no
 * mirror: it either hides an open shop or advertises a closed one.
 *
 * Computed rather than fetched on purpose. Asking the database would be a
 * fourth round trip on a page load this project has just spent real effort
 * shortening, to answer a question from two values it already has in hand.
 */
export function isShopOpen({ opensAt, closesAt, acceptsOrders = true }, now = new Date()) {
  // The master switch beats the window: a holiday or a power cut is not an
  // arithmetic problem.
  if (!acceptsOrders) return false

  const opens = toMinutes(opensAt)
  const closes = toMinutes(closesAt)

  // Nothing usable to reason about. Open, because refusing orders on the
  // strength of a value we could not read would be the worse failure — the
  // database still has the final say.
  if (opens === null || closes === null) return true

  // Equal times mean open around the clock. This is the shipped default, and
  // it is the shop's behaviour before opening hours existed.
  if (opens === closes) return true

  const current = shopMinutesNow(now)

  // The end is exclusive: at exactly 23:00, a shop closing at 23:00 is shut.
  return opens < closes
    ? current >= opens && current < closes
    : // The window crosses midnight — 18:00 to 06:00. Inside it means at or
      // after opening OR before closing. The obvious `&&` here is wrong and
      // refuses every hour of the night.
      current >= opens || current < closes
}

/** "23:00" or "23:00:00" to minutes past midnight. Null if it is neither. */
function toMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ''))
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null

  return hours * 60 + minutes
}

/**
 * What time it is where the shop is, in minutes past midnight.
 *
 * Read through Intl rather than by adding five hours to UTC. Pakistan keeps no
 * daylight saving today, so the arithmetic would be right today — and would
 * quietly become wrong the year that changes, in a way nobody would connect to
 * this function.
 */
function shopMinutesNow(now) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SHOP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const value = (type) => Number(parts.find((part) => part.type === type)?.value ?? 0)

  // Intl renders midnight as "24" in some environments and "00" in others.
  return (value('hour') % 24) * 60 + value('minute')
}

/** "12:00" to "12pm", for telling a customer when to come back. */
export function formatShopTime(value) {
  const minutes = toMinutes(value)
  if (minutes === null) return ''

  const hours24 = Math.floor(minutes / 60)
  const mins = minutes % 60
  const suffix = hours24 < 12 ? 'am' : 'pm'
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12

  return mins === 0 ? `${hours12}${suffix}` : `${hours12}:${String(mins).padStart(2, '0')}${suffix}`
}
