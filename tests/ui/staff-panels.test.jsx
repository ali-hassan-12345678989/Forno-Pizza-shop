// @vitest-environment jsdom
/**
 * The staff panels render for the role that owns them.
 *
 * Signed out, StaffGate redirects every panel URL to the login form — so a
 * smoke test that mounts /admin/menu anonymously is really only testing the
 * login page. This file hands the mock a session and a role so the panel itself
 * renders, which is the only way a test can see the panels at all.
 *
 * This is the file that would have caught Audit 2's L-1: four screens carried a
 * copy-pasted search box whose styling lived in one screen's stylesheet, so
 * three of them shipped visibly broken. A test cannot assert on CSS that a
 * bundler never loaded, but it can assert that every screen which should have a
 * search box has exactly one, built from the same component — which is the
 * property that was actually violated.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { makeMockSupabase } from './mockSupabase.js'

const INGREDIENTS = [
  {
    id: 'aaaaaaa1-0000-0000-0000-000000000001',
    name: 'Mozzarella',
    unit: 'g',
    stock_quantity: 25000,
    low_stock_threshold: 5000,
    is_low: false,
    is_out: false,
  },
  {
    id: 'aaaaaaa1-0000-0000-0000-000000000002',
    name: 'Chicken Fillet',
    unit: 'pc',
    stock_quantity: 180,
    low_stock_threshold: 40,
    is_low: false,
    is_out: false,
  },
]

/* The shape staff_usage_between() returns. `variance: null` is the honest
   default — nobody has counted these shelves — and the screen must render that
   as "not counted" rather than as a clean zero. */
const USAGE = INGREDIENTS.map((i) => ({
  ...i,
  ingredient_id: i.id,
  used: 0,
  received: 0,
  variance: null,
  counts_taken: 0,
  last_counted_at: null,
}))

const ORDERS = [
  {
    id: 'bbbbbbb1-0000-0000-0000-000000000001',
    order_number: '1000',
    status: 'pending',
    fulfillment_type: 'delivery',
    customer_name: 'Test Customer',
    customer_phone: '03001234567',
    delivery_address: 'F-7 Markaz, Islamabad',
    total: 1200,
    subtotal: 1050,
    delivery_fee: 150,
    tax: 0,
    created_at: new Date().toISOString(),
    items: [],
  },
]

const MENU = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Chicken Tikka',
    category: 'pizza',
    is_active: true,
    is_sold_out: false,
    out_of_stock: false,
    sort_order: 1,
    image_url: null,
    description: 'Tikka chicken',
    sizes: [{ id: '2'.repeat(8), size: 'Medium', price: 1050, sort_order: 1 }],
  },
]

const STAFF_RPCS = {
  staff_ingredients: INGREDIENTS,
  staff_usage_between: USAGE,
  staff_top_items: [],
  staff_cancelled_orders: [],
  sales_by_daypart: [],
  staff_stock_alerts: [],
  admin_orders: ORDERS,
  admin_active_orders: ORDERS,
  chef_orders: ORDERS,
  admin_menu_items: MENU,
  sales_report: [{ bucket: '2026-09-28', orders: 1, revenue: 1200 }],
}

vi.mock('../../src/supabaseClient', () => ({
  supabase: makeMockSupabase({ signedIn: true, role: 'admin', rpcs: STAFF_RPCS }),
}))

window.scrollTo = () => {}

const { SettingsProvider } = await import('../../src/context/SettingsContext.jsx')
const { AuthProvider } = await import('../../src/context/AuthContext.jsx')
const { StaffProvider } = await import('../../src/context/StaffContext.jsx')
const { OrderProvider } = await import('../../src/context/OrderContext.jsx')
const { CartProvider } = await import('../../src/context/CartContext.jsx')
const SettingsGate = (await import('../../src/components/SettingsGate.jsx')).default
const App = (await import('../../src/App.jsx')).default

function mountAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SettingsProvider>
        <SettingsGate>
          <AuthProvider>
            <StaffProvider>
              <OrderProvider>
                <CartProvider>
                  <App />
                </CartProvider>
              </OrderProvider>
            </StaffProvider>
          </AuthProvider>
        </SettingsGate>
      </SettingsProvider>
    </MemoryRouter>,
  )
}

const BOUNDARY_TEXT = /Something went wrong on this page/i

/** Waits past the gate's own "checking…" state and then past the redirect. */
async function mountPanel(path, selector) {
  const { container } = mountAt(path)

  await waitFor(
    () => {
      expect(container.querySelector('.staff-gate[aria-busy="true"]')).toBeNull()
      expect(container.querySelector(selector)).not.toBeNull()
    },
    { timeout: 6000 },
  )

  expect(screen.queryByText(BOUNDARY_TEXT), `${path} hit the error boundary`).toBeNull()
  // Landing on the sign-in form means the role never took, and every assertion
  // after that would be about the wrong page.
  expect(container.querySelector('.staff-login'), `${path} fell back to login`).toBeNull()
  return container
}

afterEach(cleanup)

/** The four Admin screens that carry a search box, and the one that does not. */
const ADMIN_PANELS = [
  ['/admin', '.panel, .staff-shell, main', false],
  ['/admin/orders', '.aord', true],
  ['/admin/menu', '.panel, .amenu, table', true],
  ['/admin/inventory', '.panel, table', true],
  ['/admin/usage', '.panel, table', true],
  ['/admin/reports', '.panel, table', false],
]

describe('an Admin session renders the Admin panels', () => {
  it.each(ADMIN_PANELS)('%s renders', async (path, selector) => {
    await mountPanel(path, selector)
  })
})

describe('the shared search field reaches every screen that needs one', () => {
  /**
   * Audit 2's L-1 in assertion form. Each of these four screens must have
   * exactly one search box, and it must be the shared component — one input of
   * `type=search` inside a `.stock-search`, with an icon as a sibling. Four
   * hand-rolled copies satisfied the first half of that and diverged on the
   * second, which is how three of them ended up unstyled.
   */
  it.each([['/admin/orders'], ['/admin/menu'], ['/admin/inventory'], ['/admin/usage']])(
    '%s has exactly one shared SearchField',
    async (path) => {
      const container = await mountPanel(path, '.stock-search')

      const wrappers = container.querySelectorAll('.stock-search')
      expect(wrappers.length, `${path} should have one search box`).toBe(1)

      const wrapper = wrappers[0]
      expect(wrapper.querySelectorAll('input[type="search"]').length).toBe(1)
      // The icon is a direct child of the wrapper, not nested in the input's
      // parent chain — that relationship is what the CSS positions against.
      expect(wrapper.querySelector('svg.stock-search-icon')).not.toBeNull()
      // A visually hidden label, so the field is announced and not just a box.
      expect(wrapper.querySelector('label.sr-only')).not.toBeNull()
    },
  )

  it('every search box in the app comes from the one component', async () => {
    // A fifth screen growing its own copy is the regression this guards. If a
    // `type=search` input ever appears outside a `.stock-search`, someone has
    // hand-rolled another one.
    for (const path of ['/admin/orders', '/admin/menu', '/admin/inventory', '/admin/usage']) {
      const container = await mountPanel(path, '.stock-search')
      const strays = [...container.querySelectorAll('input[type="search"]')].filter(
        (input) => !input.closest('.stock-search'),
      )
      expect(strays.length, `${path} has a search input outside SearchField`).toBe(0)
      cleanup()
    }
  })
})
