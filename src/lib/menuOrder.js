/**
 * Where an item sits on the menu, and what has to be saved to move it.
 *
 * admin_menu_items() orders by (sort_order, name), so the position the Admin
 * sees is a position in the whole menu — not within its category. That is also
 * the order the customer menu uses, so moving an item here moves it there.
 *
 * Moving means renumbering rather than swapping two values, because sort_order
 * defaults to 0: a menu nobody has reordered is entirely ties, and swapping two
 * zeroes moves nothing at all. Assigning 1..n makes the order on screen the
 * order that is stored. Only the rows whose number actually changes are sent,
 * so the first move on a fresh menu writes every row and every move after it
 * writes two.
 */

export const MOVE_UP = -1
export const MOVE_DOWN = 1

/** 1-based place in the list, or null if the item is not in it. */
export function positionOf(items, id) {
  const index = items.findIndex((item) => item.id === id)
  return index === -1 ? null : index + 1
}

export function canMove(items, id, direction) {
  const index = items.findIndex((item) => item.id === id)
  if (index === -1) return false

  const target = index + direction
  return target >= 0 && target < items.length
}

/**
 * Moves one item one place, returning the new order and the smallest set of
 * { id, sortOrder } rows that has to be saved for that order to hold.
 *
 * Moving again before saving is safe: each call recomputes the changes against
 * the sortOrder every item still carries from the database, not against the
 * previous move's answer.
 */
export function moveItem(items, id, direction) {
  const index = items.findIndex((item) => item.id === id)
  if (index === -1) return { items, changes: [] }

  const target = index + direction
  if (target < 0 || target >= items.length) return { items, changes: [] }

  const next = [...items]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)

  return { items: next, changes: changesFor(next) }
}

/** The rows whose stored sort_order disagrees with the place they now hold. */
export function changesFor(items) {
  const changes = []

  items.forEach((item, index) => {
    const sortOrder = index + 1
    if (item.sortOrder !== sortOrder) changes.push({ id: item.id, sortOrder })
  })

  return changes
}

/**
 * Whether the list has been reordered relative to the one it started as.
 *
 * changesFor() answers a different question — what would have to be written for
 * the current order to hold — and its answer is non-empty whenever the stored
 * numbers disagree with the displayed order, which they do on a menu nobody has
 * ever reordered. That is not something the Admin did, so it must not count as
 * an unsaved change.
 */
export function isReordered(items, original) {
  if (items.length !== original.length) return true
  return items.some((item, index) => item.id !== original[index].id)
}
