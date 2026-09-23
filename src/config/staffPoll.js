/**
 * How often a staff screen re-checks live data.
 *
 * Faster than the customer's tracker (STATUS_POLL_MS, 20s) and for a different
 * reason. A customer is waiting half an hour and refreshes the moment they look
 * at the tab; twenty seconds is invisible to them. Two staff working the same
 * order are coordinating with each other, and that is where the lag is felt —
 * the chef presses "Out for delivery" and the Admin's screen should agree
 * before anyone picks up a phone to ask.
 *
 * Ten seconds at one shop with a handful of screens is a few thousand requests
 * a day, which is nothing. This is deliberately NOT a WebSocket: a dropped
 * socket leaves a screen that looks healthy and is silently frozen, which is
 * worse in a kitchen than ten seconds of lag. If push is ever added, this poll
 * stays underneath it as the thing that guarantees the screen converges.
 */
export const STAFF_POLL_MS = 10_000
