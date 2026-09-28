// @vitest-environment jsdom
/**
 * "Order again" actually fills the cart, at today's prices.
 *
 * lib/reorder.js is tested on its own. This is the wiring: the click reaches
 * the cart, the customer ends up at the cart when everything is available, and
 * is told in place when something is not — rather than being walked to a cart
 * that is quietly one item shorter than the order it came from.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const added = []
const navigated = []

vi.mock('../../src/context/CartContext', () => ({
  useCart: () => ({
    addLine: (item, size, toppings, quantity) => added.push({ item, size, toppings, quantity }),
  }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => (to) => navigated.push(to) }
})

const ReorderButton = (await import('../../src/components/ReorderButton.jsx')).default

const MENU = [
  {
    id: 'item-1',
    name: 'Chicken Tikka',
    isSoldOut: false,
    sizes: [{ id: 'size-m', label: 'Medium', price: 1200 }],
    toppings: [{ id: 'top-1', name: 'Black Olives', price: 100 }],
  },
]

const line = (over = {}) => ({
  menuItemId: 'item-1',
  name: 'Chicken Tikka',
  sizeLabel: 'Medium',
  quantity: 2,
  unitPrice: 1050,
  toppings: [],
  ...over,
})

function mount(order, menu = MENU) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="*" element={<ReorderButton order={order} menu={menu} />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  added.length = 0
  navigated.length = 0
})

describe('when the whole order can be repeated', () => {
  it('adds every line and goes to the cart', () => {
    mount({ items: [line()] })

    fireEvent.click(screen.getByRole('button', { name: /order again/i }))

    expect(added).toHaveLength(1)
    expect(added[0].quantity).toBe(2)
    expect(navigated).toEqual(['/cart'])
  })

  it("adds it at today's price, not the price that was paid", () => {
    mount({ items: [line()] })
    fireEvent.click(screen.getByRole('button', { name: /order again/i }))

    // The order was placed at 1050. The menu says 1200.
    expect(added[0].size.price).toBe(1200)
  })
})

describe('when something is missing', () => {
  it('stays put and names what is gone, rather than walking them to a short cart', () => {
    const { container } = mount({
      items: [line(), line({ menuItemId: 'gone', name: 'Retired Pizza' })],
    })

    fireEvent.click(screen.getByRole('button', { name: /order again/i }))

    expect(added).toHaveLength(1)
    expect(navigated).toEqual([])
    // textContent rather than getByText: the note is one sentence split across
    // a text node and a link, and getByText matches within a single element.
    expect(container.textContent).toMatch(/Retired Pizza/)
    expect(container.textContent).toMatch(/no longer available/i)
    // And a way onward, so the note is not a dead end.
    expect(screen.getByRole('link', { name: /go to cart/i })).not.toBeNull()
  })

  it('a dropped topping is reported too', () => {
    const { container } = mount({
      items: [line({ toppings: [{ id: 'gone', name: 'Pineapple', price: 90 }] })],
    })

    fireEvent.click(screen.getByRole('button', { name: /order again/i }))

    expect(added).toHaveLength(1)
    expect(container.textContent).toMatch(/Pineapple/)
  })
})

describe('when none of it is still sold', () => {
  it('offers the menu instead of a button that would do nothing', () => {
    const { container } = mount({ items: [line({ menuItemId: 'gone', name: 'Retired Pizza' })] })
    expect(container.textContent).toMatch(/Nothing from this order/i)

    expect(screen.queryByRole('button', { name: /order again/i })).toBeNull()
    expect(screen.getByRole('link')).not.toBeNull()
  })
})

describe('before the menu has loaded', () => {
  it('renders nothing rather than a button that cannot work yet', () => {
    const { container } = mount({ items: [line()] }, null)

    expect(container.firstChild).toBeNull()
  })
})
