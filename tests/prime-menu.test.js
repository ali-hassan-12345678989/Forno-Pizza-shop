/**
 * The menu request must leave before React does, and exactly once.
 *
 * Audit 3 measured the menu starting 24ms AFTER shop_settings finished — not
 * alongside it, behind it. The gate was the only reason: the Menu page could
 * not mount, so it could not fetch. Priming from main.jsx puts both calls in
 * flight together, which took the menu from 956ms to 651ms on screen.
 *
 * These guard the three properties that make that safe rather than merely fast:
 * one request not two, a failed prime that does not poison the retry, and no
 * prefetch on staff routes.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

const fetchMenu = vi.fn()
const fetchReviewSummary = vi.fn()

vi.mock('../src/api/menu.js', () => ({
  fetchMenu: (...a) => fetchMenu(...a),
  categoriesOf: () => [],
}))
vi.mock('../src/api/reviews.js', () => ({ fetchReviewSummary: (...a) => fetchReviewSummary(...a) }))

const { primeMenu, consumeMenu, resetPrimedMenu, shouldPrefetchMenu, PRIME_MAX_AGE_MS } =
  await import('../src/lib/primeMenu.js')

beforeEach(() => {
  resetPrimedMenu()
  fetchMenu.mockReset().mockResolvedValue([{ id: 'a', name: 'Pizza' }])
  fetchReviewSummary.mockReset().mockResolvedValue(new Map())
})

afterEach(() => resetPrimedMenu())

describe('priming the menu', () => {
  it('fires both requests once', () => {
    primeMenu()
    expect(fetchMenu).toHaveBeenCalledTimes(1)
    expect(fetchReviewSummary).toHaveBeenCalledTimes(1)
  })

  it('priming twice does not fetch twice', () => {
    primeMenu()
    primeMenu()
    expect(fetchMenu).toHaveBeenCalledTimes(1)
  })

  it('consuming after priming reuses the in-flight request rather than starting another', async () => {
    primeMenu()
    const { menu } = consumeMenu()

    expect(fetchMenu).toHaveBeenCalledTimes(1)
    await expect(menu).resolves.toEqual([{ id: 'a', name: 'Pizza' }])
  })

  it('consuming without priming still works', async () => {
    const { menu } = consumeMenu()

    expect(fetchMenu).toHaveBeenCalledTimes(1)
    await expect(menu).resolves.toHaveLength(1)
  })

  it('goes back to the network once the primed answer is too old', async () => {
    /**
     * The fourth audit's M-2. This claimed to be a handover while behaving as
     * a cache with no age limit: a customer landing on the home page, reading
     * it, and clicking through to the menu ten minutes later was handed the
     * answer fetched ten minutes earlier, with no refetch.
     *
     * It matters because the menu is exactly the data that goes stale —
     * is_sold_out and out_of_stock flip during service — so the stale copy
     * offers a dish that has gone, and the customer is refused at the last
     * step after filling in an address.
     */
    const t0 = 1_000_000
    primeMenu(t0)

    consumeMenu(t0 + PRIME_MAX_AGE_MS + 1)

    expect(fetchMenu).toHaveBeenCalledTimes(2)
  })

  it('still hands over an answer that is fresh enough', () => {
    // The whole measured win is on the direct load, where the page mounts a
    // few hundred milliseconds later — nowhere near the bound.
    const t0 = 1_000_000
    primeMenu(t0)

    consumeMenu(t0 + 500)

    expect(fetchMenu).toHaveBeenCalledTimes(1)
  })

  it('the staleness bound is short enough to matter and long enough to be useful', () => {
    expect(PRIME_MAX_AGE_MS).toBeGreaterThanOrEqual(5_000)
    expect(PRIME_MAX_AGE_MS).toBeLessThanOrEqual(60_000)
  })

  it('is a handover, not a cache — a second consume goes back to the network', async () => {
    // A customer who reloads the menu expects the menu as it is now. If this
    // ever starts returning the first promise twice, a sold-out item stays on
    // sale until the tab is closed.
    primeMenu()
    await consumeMenu().menu
    await consumeMenu().menu

    expect(fetchMenu).toHaveBeenCalledTimes(2)
  })

  it('a failed prime does not poison the retry', async () => {
    // The whole point of the retry button. If the rejected promise were handed
    // out again, every retry would fail identically and instantly, and the
    // customer would conclude the shop is broken.
    fetchMenu.mockRejectedValueOnce(new Error('network down'))

    primeMenu()
    await expect(consumeMenu().menu).rejects.toThrow('network down')

    fetchMenu.mockResolvedValue([{ id: 'b', name: 'Recovered' }])
    await expect(consumeMenu().menu).resolves.toEqual([{ id: 'b', name: 'Recovered' }])
  })

  it('an unconsumed failure does not become an unhandled rejection', async () => {
    // Nothing awaits the primed promise until Menu mounts. Without a handler
    // attached at prime time, a failure in that window is an unhandled
    // rejection — noise at best, a reported crash at worst.
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)

    fetchMenu.mockRejectedValueOnce(new Error('boom'))
    fetchReviewSummary.mockRejectedValueOnce(new Error('boom'))
    primeMenu()
    await new Promise((r) => setTimeout(r, 50))

    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })
})

describe('only the two pages that use it prefetch', () => {
  /**
   * The fourth audit found this firing on every non-staff route, so /cart,
   * /checkout and /track each spent two requests on an answer nothing read.
   * /menu reads it immediately; / is the page whose normal next step is the
   * menu, so its prefetch is usually collected.
   */
  it.each([
    ['/', true],
    ['/menu', true],
    ['/cart', false],
    ['/checkout', false],
    ['/track/abc', false],
    ['/orders', false],
    ['/staff', false],
    ['/manager', false],
    ['/manager/stock', false],
    ['/admin', false],
    ['/admin/orders/123', false],
    ['/chef', false],
  ])('%s -> prefetch: %s', (path, expected) => {
    expect(shouldPrefetchMenu(path)).toBe(expected)
  })

  it('does not match a path that merely starts the same way', () => {
    expect(shouldPrefetchMenu('/menupage')).toBe(false)
    expect(shouldPrefetchMenu('/menu/extra')).toBe(false)
  })

  it('handles a missing pathname rather than throwing', () => {
    expect(shouldPrefetchMenu(undefined)).toBe(false)
    expect(shouldPrefetchMenu(null)).toBe(false)
  })
})
