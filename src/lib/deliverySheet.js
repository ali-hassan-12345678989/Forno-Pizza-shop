import { isValidReceipt } from '../config/inventory'

/**
 * The delivery sheet, as plain functions.
 *
 * A delivery note arrives with several lines on it, so the sheet takes several
 * lines. Everything here is pure — the component owns the state, these decide
 * what the next one is — which is what lets tests/delivery-sheet.test.js check
 * the rules without a browser.
 */

/** One line per ingredient. Booking the same thing twice is a slip, not a feature. */
export function hasLine(lines, ingredientId) {
  return lines.some((line) => line.ingredientId === ingredientId)
}

export function addLine(lines, ingredientId) {
  if (!ingredientId || hasLine(lines, ingredientId)) return lines
  return [...lines, { ingredientId, quantity: '' }]
}

export function removeLine(lines, ingredientId) {
  return lines.filter((line) => line.ingredientId !== ingredientId)
}

export function setQuantity(lines, ingredientId, quantity) {
  return lines.map((line) => (line.ingredientId === ingredientId ? { ...line, quantity } : line))
}

/**
 * The lines actually worth sending.
 *
 * A line with nothing typed into it is not an error — it is a row the Manager
 * added and has not reached yet — so it is skipped rather than refused. The
 * test is isValidReceipt(), the same one the single-line form used, which is
 * the same rule receive_stock() enforces for real.
 */
export function readyLines(lines) {
  return lines.filter((line) => isValidReceipt(line.quantity))
}

/**
 * What a line will do to the stock level, shown before the Manager commits.
 *
 * This is the one place the browser works out a stock figure of its own, and
 * it is allowed precisely because the change has not happened yet — there is
 * no server answer to defer to. The rules are copied from staff_ingredients():
 * low is `stock < threshold`, out is `stock = 0`. The moment the delivery is
 * saved, every figure on screen comes from receive_stock()'s own returned row
 * again, so this projection can never outlive the thing it was predicting.
 */
export function projectLevel(ingredient, quantity) {
  if (!ingredient || !isValidReceipt(quantity)) return null

  const after = ingredient.stock + Number(quantity)
  return {
    after,
    willBeOut: after === 0,
    willBeLow: after < ingredient.threshold,
  }
}
