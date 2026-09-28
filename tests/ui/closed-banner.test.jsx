// @vitest-environment jsdom
/**
 * The customer is told the kitchen is shut before they build a cart.
 *
 * The database refuses the order either way. This is about where they find
 * out — on the menu, or after picking toppings, typing an address and pressing
 * the button.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const shop = { current: {} }
vi.mock('../../src/context/SettingsContext', () => ({ useShop: () => shop.current }))

const ClosedBanner = (await import('../../src/components/ClosedBanner.jsx')).default

const AFTERNOON = new Date('2026-09-28T09:30:00Z') // 14:30 PKT
const SMALL_HOURS = new Date('2026-09-28T23:30:00Z') // 04:30 PKT

function renderAt(settings, now) {
  shop.current = settings
  vi.setSystemTime(now)
  return render(<ClosedBanner />)
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('when the shop is open', () => {
  it('renders nothing at all', () => {
    vi.useFakeTimers()
    const { container } = renderAt({ opensAt: '12:00', closesAt: '23:00' }, AFTERNOON)

    // Not an empty banner, not a hidden one — no node. An open shop should
    // pay nothing in layout or attention for this.
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when the window is 24 hours, which is the shipped default', () => {
    vi.useFakeTimers()
    const { container } = renderAt({ opensAt: '00:00', closesAt: '00:00' }, SMALL_HOURS)

    expect(container.firstChild).toBeNull()
  })
})

describe('when the shop is shut', () => {
  it('says so, and says when it opens again', () => {
    vi.useFakeTimers()
    renderAt({ opensAt: '12:00', closesAt: '23:00' }, SMALL_HOURS)

    expect(screen.getByText(/kitchen is closed/i)).not.toBeNull()
    // "Come back at 12pm" is actionable. "We are closed" is not.
    expect(screen.getByText(/12pm/)).not.toBeNull()
  })

  it('is announced to a screen reader without stealing focus', () => {
    vi.useFakeTimers()
    const { container } = renderAt({ opensAt: '12:00', closesAt: '23:00' }, SMALL_HOURS)

    // status, not alert: this is a standing condition of the page, not an
    // interruption, and alert would talk over whatever is being read.
    expect(container.querySelector('[role="status"]')).not.toBeNull()
  })

  it('offers no opening time when closed by the master switch', () => {
    vi.useFakeTimers()
    // A holiday has no "back at" — it reopens when someone says so, and
    // inventing a time would be worse than saying nothing.
    renderAt({ opensAt: '12:00', closesAt: '23:00', acceptsOrders: false }, AFTERNOON)

    expect(screen.getByText(/kitchen is closed/i)).not.toBeNull()
    expect(screen.queryByText(/12pm/)).toBeNull()
    expect(screen.getByText(/check back soon/i)).not.toBeNull()
  })
})
