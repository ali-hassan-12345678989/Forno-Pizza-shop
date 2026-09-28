// @vitest-environment jsdom
/**
 * Last visit's shop details render immediately; money waits for the database.
 *
 * SettingsGate used to hold the entire app back until shop_settings returned.
 * Measured on a production build, the home page headline appeared at 790ms —
 * and that headline is static copy that reads nothing from the shop settings at
 * all. Reading the previous answer first took a returning customer to 243ms
 * with no spinner.
 *
 * The risk that buys is staleness, so these tests pin down exactly where it is
 * allowed: a name and a phone number, yes. A delivery fee on a screen showing a
 * total, never.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { makeMockSupabase } from './mockSupabase.js'

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

/** Held open so a test can decide when the database answers. */
let releaseSettings
const settingsGate = () =>
  new Promise((resolve) => {
    releaseSettings = () => resolve()
  })

vi.mock('../../src/supabaseClient', () => {
  const base = makeMockSupabase({ tables: { shop_settings: LIVE } })
  return {
    supabase: {
      ...base,
      from: (table) => {
        const builder = base.from(table)
        if (table !== 'shop_settings') return builder
        // Same builder, but `.single()` waits for the test to let it through.
        return new Proxy(builder, {
          get: (target, prop) =>
            prop === 'single'
              ? () => settingsGate().then(() => ({ data: LIVE, error: null }))
              : target[prop],
        })
      },
    },
  }
})

window.scrollTo = () => {}

const { STORAGE_KEYS } = await import('../../src/config/storage.js')
const { SettingsProvider } = await import('../../src/context/SettingsContext.jsx')
const SettingsGate = (await import('../../src/components/SettingsGate.jsx')).default
const { useShop } = await import('../../src/context/SettingsContext.jsx')

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

function Shopfront() {
  const shop = useShop()
  return <p data-testid="shop">{`${shop.name} ${shop.phone} ${shop.deliveryFee}`}</p>
}

function mount({ requireFresh = false } = {}) {
  return render(
    <MemoryRouter>
      <SettingsProvider>
        <SettingsGate requireFresh={requireFresh}>
          <Shopfront />
        </SettingsGate>
      </SettingsProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  releaseSettings = () => {}
})

afterEach(cleanup)

describe('a first-time visitor', () => {
  it('sees the spinner, exactly as before — nothing regressed for them', async () => {
    const { container } = mount()

    expect(container.querySelector('.gate')).not.toBeNull()
    expect(screen.queryByTestId('shop')).toBeNull()

    releaseSettings()
    await waitFor(() => expect(screen.queryByTestId('shop')).not.toBeNull())
  })

  it('has the details cached afterwards, for next time', async () => {
    mount()
    releaseSettings()

    await waitFor(() => expect(screen.queryByTestId('shop')).not.toBeNull())
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.shopSettings)).name).toBe('Forno')
  })
})

describe('a returning visitor', () => {
  it('renders the shopfront with no spinner at all, before the database answers', () => {
    localStorage.setItem(STORAGE_KEYS.shopSettings, JSON.stringify(CACHED))

    const { container } = mount()

    // Synchronously, on the first render — no waitFor, because there is
    // nothing to wait for. This is the whole point.
    expect(container.querySelector('.gate')).toBeNull()
    expect(screen.getByTestId('shop').textContent).toContain('051 000 000 000')
  })

  it('is corrected the moment the real answer arrives', async () => {
    localStorage.setItem(STORAGE_KEYS.shopSettings, JSON.stringify(CACHED))
    mount()

    releaseSettings()

    await waitFor(() => expect(screen.getByTestId('shop').textContent).toContain('051 111 367 667'))
    // And the cache now holds the corrected value rather than the old one.
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.shopSettings)).phone).toBe(
      '051 111 367 667',
    )
  })
})

describe('an unusable cache is ignored rather than half-rendered', () => {
  /**
   * A header with blanks in it looks broken in a way a spinner never does, so a
   * truncated or outdated cache must fail closed.
   */
  it.each([
    ['missing a field', { name: 'Forno', phone: '051' }],
    ['an empty string', { ...CACHED, name: '' }],
    ['a null field', { ...CACHED, phoneHref: null }],
    ['a non-numeric fee', { ...CACHED, deliveryFee: 'free' }],
    ['not an object', 'forno'],
  ])('%s falls back to the spinner', (_label, value) => {
    localStorage.setItem(STORAGE_KEYS.shopSettings, JSON.stringify(value))

    const { container } = mount()

    expect(container.querySelector('.gate')).not.toBeNull()
    expect(screen.queryByTestId('shop')).toBeNull()
  })

  it('unparseable JSON does not throw', () => {
    localStorage.setItem(STORAGE_KEYS.shopSettings, '{not json')

    expect(() => mount()).not.toThrow()
  })
})

describe('money never comes from the cache', () => {
  it('a screen showing a total waits for the database even with a cache', async () => {
    localStorage.setItem(STORAGE_KEYS.shopSettings, JSON.stringify(CACHED))

    const { container } = mount({ requireFresh: true })

    // The stale fee is 999. It must not reach the screen.
    expect(container.querySelector('.gate')).not.toBeNull()
    expect(screen.queryByText(/999/)).toBeNull()

    releaseSettings()

    await waitFor(() => expect(screen.getByTestId('shop').textContent).toContain('150'))
    expect(screen.queryByText(/999/)).toBeNull()
  })
})
