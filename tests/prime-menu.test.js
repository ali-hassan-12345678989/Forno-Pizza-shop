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
import { isStaffPath } from '../src/config/routes.js'

const fetchMenu = vi.fn()
const fetchReviewSummary = vi.fn()

vi.mock('../src/api/menu.js', () => ({
  fetchMenu: (...a) => fetchMenu(...a),
  categoriesOf: () => [],
}))
vi.mock('../src/api/reviews.js', () => ({ fetchReviewSummary: (...a) => fetchReviewSummary(...a) }))

const { primeMenu, consumeMenu, resetPrimedMenu } = await import('../src/lib/primeMenu.js')

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

describe('staff routes are not prefetched', () => {
  /**
   * A Manager checking stock has no use for the customer menu, and two
   * requests nobody reads still cost the shop's free-tier quota.
   */
  it.each([
    ['/staff', true],
    ['/manager', true],
    ['/manager/stock', true],
    ['/admin', true],
    ['/admin/orders/123', true],
    ['/chef', true],
    ['/', false],
    ['/menu', false],
    ['/cart', false],
    ['/checkout', false],
    ['/track/abc', false],
    ['/orders', false],
  ])('%s -> staff: %s', (path, expected) => {
    expect(isStaffPath(path)).toBe(expected)
  })

  it('does not match a customer path that merely starts with the same letters', () => {
    // `/administration` is not `/admin`, and `/staffroom` is not `/staff`.
    expect(isStaffPath('/administration')).toBe(false)
    expect(isStaffPath('/staffroom')).toBe(false)
  })

  it('handles a missing pathname rather than throwing', () => {
    expect(isStaffPath(undefined)).toBe(false)
    expect(isStaffPath(null)).toBe(false)
  })
})
