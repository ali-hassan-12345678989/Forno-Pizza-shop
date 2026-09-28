/**
 * Ordering the same thing again.
 *
 * The whole risk in this feature is copying a past order forward rather than
 * looking it up again: a stale price, a size that was withdrawn, a topping that
 * no longer exists. Every test here is one of those.
 */
import { describe, it, expect } from 'vitest'
import { buildReorderPlan, canReorder } from '../src/lib/reorder.js'

const OLIVES = { id: 'top-1', name: 'Black Olives', price: 100 }
const CHEESE = { id: 'top-2', name: 'Extra Cheese', price: 150 }

const MENU = [
  {
    id: 'item-1',
    name: 'Chicken Tikka',
    isSoldOut: false,
    sizes: [
      { id: 'size-m', label: 'Medium', price: 1200 },
      { id: 'size-l', label: 'Large', price: 1800 },
    ],
    toppings: [OLIVES, CHEESE],
  },
  {
    id: 'item-2',
    name: 'Peri Peri',
    isSoldOut: true,
    sizes: [{ id: 'size-p', label: 'Medium', price: 1300 }],
    toppings: [],
  },
]

/** A past order line, with the prices that applied back then. */
const pastLine = (over = {}) => ({
  menuItemId: 'item-1',
  name: 'Chicken Tikka',
  sizeLabel: 'Medium',
  quantity: 2,
  unitPrice: 1050, // cheaper than today's 1200, on purpose
  toppings: [],
  ...over,
})

const order = (...items) => ({ items })

describe('an order that can be repeated exactly', () => {
  it('comes back as a cart line', () => {
    const { lines, unavailable } = buildReorderPlan(order(pastLine()), MENU)

    expect(unavailable).toEqual([])
    expect(lines).toHaveLength(1)
    expect(lines[0].item.id).toBe('item-1')
    expect(lines[0].size.id).toBe('size-m')
    expect(lines[0].quantity).toBe(2)
  })

  it("carries today's price, not the price that was paid", () => {
    // The single most important assertion in this file. The past line says
    // 1050; the menu says 1200. Re-adding at 1050 would show the customer a
    // total the kitchen disagrees with.
    const { lines } = buildReorderPlan(order(pastLine()), MENU)

    expect(lines[0].size.price).toBe(1200)
  })

  it('keeps the extras that are still offered', () => {
    const { lines, droppedToppings } = buildReorderPlan(
      order(pastLine({ toppings: [OLIVES, CHEESE] })),
      MENU,
    )

    expect(lines[0].toppings.map((t) => t.id)).toEqual(['top-1', 'top-2'])
    expect(droppedToppings).toEqual([])
  })

  it('repeats several lines', () => {
    const { lines } = buildReorderPlan(
      order(pastLine(), pastLine({ sizeLabel: 'Large', quantity: 1 })),
      MENU,
    )

    expect(lines).toHaveLength(2)
    expect(lines.map((l) => l.size.label)).toEqual(['Medium', 'Large'])
  })
})

describe('what cannot come back', () => {
  it('a dish that has left the menu is named, not silently dropped', () => {
    const { lines, unavailable } = buildReorderPlan(
      order(pastLine({ menuItemId: 'gone', name: 'Retired Pizza' })),
      MENU,
    )

    expect(lines).toEqual([])
    expect(unavailable).toEqual(['Retired Pizza'])
  })

  it('a sold-out dish is left out', () => {
    const { lines, unavailable } = buildReorderPlan(
      order(pastLine({ menuItemId: 'item-2', name: 'Peri Peri' })),
      MENU,
    )

    expect(lines).toEqual([])
    expect(unavailable).toEqual(['Peri Peri'])
  })

  it('a withdrawn size names the size too, so they know what to choose instead', () => {
    const { unavailable } = buildReorderPlan(order(pastLine({ sizeLabel: 'Family' })), MENU)

    expect(unavailable).toEqual(['Chicken Tikka (Family)'])
  })

  it('a dropped topping loses the extra, not the pizza', () => {
    const { lines, unavailable, droppedToppings } = buildReorderPlan(
      order(pastLine({ toppings: [OLIVES, { id: 'gone', name: 'Pineapple', price: 90 }] })),
      MENU,
    )

    expect(unavailable).toEqual([])
    expect(lines).toHaveLength(1)
    expect(lines[0].toppings.map((t) => t.id)).toEqual(['top-1'])
    expect(droppedToppings).toEqual(['Pineapple'])
  })

  it('keeps the part of an order that still works', () => {
    const { lines, unavailable } = buildReorderPlan(
      order(pastLine(), pastLine({ menuItemId: 'item-2', name: 'Peri Peri' })),
      MENU,
    )

    expect(lines).toHaveLength(1)
    expect(unavailable).toEqual(['Peri Peri'])
  })

  it('names a missing dish once however many lines had it', () => {
    const gone = { menuItemId: 'gone', name: 'Retired Pizza' }
    const { unavailable } = buildReorderPlan(
      order(pastLine(gone), pastLine({ ...gone, sizeLabel: 'Large' })),
      MENU,
    )

    expect(unavailable).toEqual(['Retired Pizza'])
  })
})

describe('nothing to repeat', () => {
  it.each([
    ['no order', null],
    ['no items', { items: [] }],
    ['items missing entirely', {}],
  ])('%s gives an empty plan rather than throwing', (_label, value) => {
    expect(() => buildReorderPlan(value, MENU)).not.toThrow()
    expect(buildReorderPlan(value, MENU).lines).toEqual([])
  })

  it('an empty menu gives an empty plan', () => {
    expect(buildReorderPlan(order(pastLine()), []).lines).toEqual([])
    expect(buildReorderPlan(order(pastLine()), null).lines).toEqual([])
  })
})

describe('matching the size', () => {
  /**
   * Regression: the reorder button shipped matching on the label alone, which
   * works until the shop renames a size. The order line keeps the size row's
   * id, so use that first.
   */
  it('prefers the size id over the label, so a rename does not break repeats', () => {
    const renamed = [{ ...MENU[0], sizes: [{ id: 'size-m', label: 'Regular', price: 1200 }] }]
    const { lines, unavailable } = buildReorderPlan(
      order(pastLine({ menuItemSizeId: 'size-m', sizeLabel: 'Medium' })),
      renamed,
    )

    expect(unavailable).toEqual([])
    expect(lines[0].size.label).toBe('Regular')
  })

  it('falls back to the label when the line carries no size id', () => {
    // get_order_by_token() does not return menu_item_size_id.
    const { lines } = buildReorderPlan(order(pastLine({ menuItemSizeId: null })), MENU)

    expect(lines[0].size.id).toBe('size-m')
  })

  it('a size id that no longer exists still reports the dish and size', () => {
    const { unavailable } = buildReorderPlan(
      order(pastLine({ menuItemSizeId: 'withdrawn', sizeLabel: 'Family' })),
      MENU,
    )

    expect(unavailable).toEqual(['Chicken Tikka (Family)'])
  })
})

describe('canReorder', () => {
  it('is true when at least one line survives', () => {
    expect(canReorder(order(pastLine(), pastLine({ menuItemId: 'gone' })), MENU)).toBe(true)
  })

  it('is false when none do', () => {
    expect(canReorder(order(pastLine({ menuItemId: 'gone' })), MENU)).toBe(false)
  })
})
