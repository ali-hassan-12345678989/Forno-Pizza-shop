// @vitest-environment jsdom
/**
 * The three behaviours the fourth audit found broken, pinned so they stay fixed.
 *
 * All three were introduced by the third audit's own fixes, which is the reason
 * this file exists as a group rather than as three additions scattered through
 * the suite: they share a cause. Each one is a case where a change that was
 * right on its own removed a fallback that something else depended on.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { lazy, Suspense } from 'react'

const LIVE = {
  id: 1,
  name: 'Forno',
  tagline: 'Wood-fired pizza',
  phone_display: '051 111 367 667',
  phone_e164: '+925111136766',
  address: 'F-7 Markaz, Islamabad',
  hours: 'Open daily 12pm – 11pm',
  delivery_eta: '25–35 min',
  pickup_eta: '15 min',
  delivery_fee: 150,
}

/** Flipped per test: does the settings request succeed or fail? */
let settingsResult = () => Promise.resolve({ data: LIVE, error: null })

vi.mock('../../src/supabaseClient', () => ({
  supabase: {
    from: () => ({ select: () => ({ abortSignal: () => ({ single: () => settingsResult() }) }) }),
    rpc: () => Promise.resolve({ data: [], error: null }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}))

window.scrollTo = () => {}

const { STORAGE_KEYS } = await import('../../src/config/storage.js')
const { SettingsProvider } = await import('../../src/context/SettingsContext.jsx')
const SettingsGate = (await import('../../src/components/SettingsGate.jsx')).default
const ErrorBoundary = (await import('../../src/components/ErrorBoundary.jsx')).default

const CACHED = {
  name: 'Forno',
  tagline: 'Wood-fired pizza',
  phone: '051 000 000 000',
  phoneHref: 'tel:+920000000000',
  address: 'F-7 Markaz, Islamabad',
  hours: 'Open daily 12pm – 11pm',
  deliveryEta: '25–35 min',
  pickupEta: '15 min',
  deliveryFee: 999,
}

const mountGate = (requireFresh) =>
  render(
    <MemoryRouter>
      <SettingsProvider>
        <SettingsGate requireFresh={requireFresh}>
          <p data-testid="content">CHECKOUT</p>
        </SettingsGate>
      </SettingsProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  localStorage.clear()
  settingsResult = () => Promise.resolve({ data: LIVE, error: null })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('H-1: a cached copy must not hide the failure from the checkout', () => {
  /**
   * What broke. The settings cache recorded an error only when there was no
   * cache: `if (!settings) setError(...)`. The cart and checkout wait for
   * FRESH settings, so a returning customer with a cached copy and a failed
   * request met a spinner that never stopped — no message, no retry, no
   * timeout. They could browse, build a cart, open it, and go no further.
   *
   * Before the third audit added the cache, this same failure produced an
   * error screen with a working retry after 4 seconds.
   */
  beforeEach(() => {
    settingsResult = () => Promise.reject(new Error('network down'))
    localStorage.setItem(STORAGE_KEYS.shopSettings, JSON.stringify(CACHED))
  })

  it('the checkout shows an error and a retry rather than an endless spinner', async () => {
    const { container } = mountGate(true)

    await waitFor(() => {
      expect(container.textContent).toMatch(/could not reach the kitchen/i)
    })

    expect(container.querySelector('button'), 'there must be a way out').not.toBeNull()
    expect(container.querySelector('.gate[aria-busy="true"]'), 'not still spinning').toBeNull()
  })

  it('the stale delivery fee still never reaches a screen showing a total', async () => {
    // The reason the cart waits for fresh settings in the first place. Fixing
    // the spinner must not quietly start trusting the cache for money.
    const { container } = mountGate(true)

    await waitFor(() => expect(container.textContent).toMatch(/could not reach the kitchen/i))
    expect(container.textContent).not.toMatch(/999/)
    expect(screen.queryByTestId('content')).toBeNull()
  })

  it('someone only browsing is still not interrupted', async () => {
    // The original reasoning was right and must survive: a customer reading the
    // menu from cache does not need an error screen. The menu works and the
    // phone number is in the header.
    const { container } = mountGate(false)

    await waitFor(() => expect(screen.queryByTestId('content')).not.toBeNull())
    expect(container.textContent).not.toMatch(/could not reach the kitchen/i)
  })

  it('a first-time visitor is unchanged', async () => {
    localStorage.clear()
    const { container } = mountGate(false)

    await waitFor(() => expect(container.textContent).toMatch(/could not reach the kitchen/i))
    expect(container.querySelector('button')).not.toBeNull()
  })
})

describe('M-4: a stale code chunk offers a reload, not a retry that cannot work', () => {
  /**
   * React stores the rejected lazy() promise and re-throws the saved error on
   * the next render without calling the import again. The audit measured it:
   * one import attempt, then none, however many times Retry was pressed. The
   * customer was stuck on an error box with a button that did nothing.
   */
  const mountFailingChunk = (message) => {
    const Boom = lazy(() => Promise.reject(new Error(message)))
    return render(
      <ErrorBoundary>
        <Suspense fallback={<span>loading</span>}>
          <Boom />
        </Suspense>
      </ErrorBoundary>,
    )
  }

  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
  afterEach(() => vi.restoreAllMocks())

  it.each([
    ['Chrome and Safari', 'Failed to fetch dynamically imported module: /assets/Admin-abc.js'],
    ['Firefox', 'error loading dynamically imported module'],
    ['a module script failure', 'Importing a module script failed.'],
  ])('%s: offers a reload', async (_browser, message) => {
    const { container } = mountFailingChunk(message)

    await waitFor(() => expect(container.textContent).toMatch(/shop has been updated/i))
    expect(container.textContent).toMatch(/reload the page/i)
    // Deliberately not phrased as an error: nothing is broken and nothing is
    // lost, so "we updated" is both true and more reassuring.
    expect(container.textContent).not.toMatch(/something went wrong/i)
  })

  it('an ordinary render error still offers a plain retry', async () => {
    const Throws = () => {
      throw new Error('a normal bug')
    }

    const { container } = render(
      <ErrorBoundary>
        <Throws />
      </ErrorBoundary>,
    )

    expect(container.textContent).toMatch(/something went wrong on this page/i)
    expect(container.textContent).not.toMatch(/reload the page/i)
  })

  it('the plain retry still clears the failure', () => {
    let shouldThrow = true
    const Flaky = () => {
      if (shouldThrow) throw new Error('once')
      return <p data-testid="recovered">FIXED</p>
    }

    const { container } = render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    )

    shouldThrow = false
    fireEvent.click(container.querySelector('button'))

    expect(screen.queryByTestId('recovered')).not.toBeNull()
  })
})
