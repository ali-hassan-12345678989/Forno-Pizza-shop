// @vitest-environment jsdom
/**
 * Every route mounts and renders its real content.
 *
 * This is the suite that did not exist. Before it, 622 tests passed while three
 * Admin screens shipped with a search box whose stylesheet never reached them,
 * because every one of those tests talks to Postgres and none of them render a
 * component. Deleting the entire user interface would not have failed one.
 *
 * WHAT EACH ROUTE WAITS FOR, AND WHY IT MATTERS. The first version of this file
 * waited for the settings spinner to clear and then asserted the page was not
 * blank. It passed with MenuCard throwing on every single render — because the
 * spinner clears when `shop_settings` arrives, and the menu items land later.
 * Waiting for the spinner is not waiting for the page. That is the same mistake
 * this audit found in the production load measurement, made again in a test, so
 * every route below names a selector that only exists once its real content is
 * on screen.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { makeMockSupabase } from './mockSupabase.js'

vi.mock('../../src/supabaseClient', () => ({ supabase: makeMockSupabase() }))

// jsdom has no layout, so it has no scrollTo. ScrollToTop calls it on every
// navigation; stubbing it keeps the output readable without hiding anything.
window.scrollTo = () => {}

const { SettingsProvider } = await import('../../src/context/SettingsContext.jsx')
const { AuthProvider } = await import('../../src/context/AuthContext.jsx')
const { StaffProvider } = await import('../../src/context/StaffContext.jsx')
const { OrderProvider } = await import('../../src/context/OrderContext.jsx')
const { CartProvider } = await import('../../src/context/CartContext.jsx')
const SettingsGate = (await import('../../src/components/SettingsGate.jsx')).default
const App = (await import('../../src/App.jsx')).default
const { ROUTES } = await import('../../src/config/routes.js')

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

/** Mounts, waits for the route's own content, and fails on any render error. */
async function expectRouteRenders(path, selector) {
  const { container } = mountAt(path)

  await waitFor(() => expect(container.querySelector(selector)).not.toBeNull(), { timeout: 5000 })

  expect(screen.queryByText(BOUNDARY_TEXT), `${path} hit the error boundary`).toBeNull()
  return container
}

/**
 * [name, path, selector that only exists once the page's own content renders]
 *
 * `.pcard-name` is a rendered MenuCard, not the page frame around it — that
 * distinction is the whole point of this file.
 */
const CUSTOMER_ROUTES = [
  ['home', ROUTES.home, '.hero-copy h1'],
  ['menu', ROUTES.menu, '.pcard-name'],
  ['cart', ROUTES.cart, '.cart-page'],
  ['checkout', ROUTES.checkout, '.checkout-page'],
  ['track', ROUTES.track, '.track-page'],
  ['orders', ROUTES.orders, '.orders-page'],
  ['not found', '/no-such-page', '.placeholder'],
]

/**
 * Signed out, every panel should land on the gate's refusal rather than throw.
 * These also prove the lazy chunks resolve — a broken dynamic import shows up
 * here and nowhere else in the suite.
 */
const STAFF_ROUTES = [
  ['staff login', ROUTES.staffLogin, '.staff-login'],
  ['manager', ROUTES.manager, '.staff-gate, .panel'],
  ['admin', ROUTES.admin, '.staff-gate, .panel'],
  ['chef', ROUTES.chef, '.staff-gate, .panel'],
  ['admin orders', '/admin/orders', '.staff-gate, .panel'],
  ['admin menu', '/admin/menu', '.staff-gate, .panel'],
  ['admin inventory', '/admin/inventory', '.staff-gate, .panel'],
  ['admin usage', '/admin/usage', '.staff-gate, .panel'],
  ['admin reports', '/admin/reports', '.staff-gate, .panel'],
  ['manager stock', '/manager/stock', '.staff-gate, .panel'],
  ['manager sales', '/manager/sales', '.staff-gate, .panel'],
  ['manager usage', '/manager/usage', '.staff-gate, .panel'],
]

afterEach(cleanup)

describe('every route renders its own content', () => {
  it.each(CUSTOMER_ROUTES)('%s', async (_name, path, selector) => {
    const container = await expectRouteRenders(path, selector)
    expect(container.textContent.trim().length).toBeGreaterThan(0)
  })

  it.each(STAFF_ROUTES)('%s', async (_name, path, selector) => {
    await expectRouteRenders(path, selector)
  })
})

describe('the smoke test can actually fail', () => {
  /**
   * A suite that has never failed is not evidence of anything — the same
   * argument mutation_test_oversell.sql makes for the concurrency test.
   *
   * These two assert the detector detects: the boundary catches a throw, and a
   * route whose content never arrives is reported rather than passed over.
   */
  it('the boundary catches a throw and says so', async () => {
    const Boom = () => {
      throw new Error('deliberate')
    }
    const ErrorBoundary = (await import('../../src/components/ErrorBoundary.jsx')).default
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { container } = render(
      <MemoryRouter>
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      </MemoryRouter>,
    )

    expect(container.textContent).toMatch(BOUNDARY_TEXT)
    vi.restoreAllMocks()
  })

  it('a route whose content never renders fails rather than passes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(expectRouteRenders(ROUTES.menu, '.selector-that-cannot-exist')).rejects.toThrow()
    vi.restoreAllMocks()
  })
})
