// @vitest-environment jsdom
/**
 * The defects feature-testing found in the Manager screens the owner reviewed.
 *
 * Every one of these was found by looking at the rendered page — screenshotting
 * it against real data, or measuring it in a real browser — and not by any
 * assertion that existed at the time. That is the argument for the file: each
 * test below is a thing that looked fine in code, passed every selector-based
 * check, and was obviously wrong the moment somebody saw it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const TrendChart = (await import('../../src/components/TrendChart.jsx')).default
const CancelledOrders = (await import('../../src/components/CancelledOrders.jsx')).default

afterEach(cleanup)

const point = (key, value) => ({ key, value, label: key })

describe('the revenue chart', () => {
  it('draws nothing for a single bucket', () => {
    /* FOUND BY SCREENSHOT. One column is its own peak and its own floor, so it
       filled the entire plot area — a solid slab of red across the panel, which
       reads as a broken chart rather than as a shop with one day of history.
       The table underneath already carries that figure. */
    const { container } = render(
      <TrendChart
        points={[point('2026-09-30', 5850)]}
        label="Revenue by day"
        formatLabel={(p) => p.label}
        formatValue={(p) => String(p.value)}
      />,
    )
    expect(container.querySelector('.trend-plot')).toBeNull()
  })

  it('draws nothing at all when nothing was taken', () => {
    // Columns of zero height are a broken chart, not a quiet month.
    const { container } = render(
      <TrendChart
        points={[point('a', 0), point('b', 0)]}
        label="Revenue by day"
        formatLabel={(p) => p.label}
        formatValue={(p) => String(p.value)}
      />,
    )
    expect(container.querySelector('.trend-plot')).toBeNull()
  })

  it('draws once there are two buckets to compare', () => {
    const { container } = render(
      <TrendChart
        points={[point('a', 100), point('b', 400)]}
        label="Revenue by day"
        formatLabel={(p) => p.label}
        formatValue={(p) => String(p.value)}
      />,
    )
    expect(container.querySelectorAll('.trend-col').length).toBe(2)
  })

  it('marks the peak, and marks only the peak', () => {
    const { container } = render(
      <TrendChart
        points={[point('a', 100), point('b', 400), point('c', 250)]}
        label="Revenue by day"
        formatLabel={(p) => p.label}
        formatValue={(p) => String(p.value)}
      />,
    )
    const peaks = container.querySelectorAll('.trend-col.is-peak')
    expect(peaks.length).toBe(1)
    expect([...container.querySelectorAll('.trend-col')].indexOf(peaks[0])).toBe(1)
  })
})

describe('the cancelled drill-down', () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({
    orderNumber: String(2000 + i),
    customerName: 'Someone',
    fulfillmentType: 'pickup',
    total: 1000,
    reason: i === 0 ? 'too_slow' : null,
    createdAt: '2026-09-30T06:00:00Z',
  }))

  it('reports the TRUE total, not the number of rows it was handed', () => {
    /* FOUND BY SCREENSHOT. staff_cancelled_orders() caps at 200, so on a busy
       month this panel printed "200 cancelled orders" directly underneath a
       summary figure reading 210. Two numbers on one screen quietly
       contradicting each other is how a reader stops trusting both. */
    render(<CancelledOrders rows={rows} days={30} total={210} />)
    expect(screen.getByText(/210 cancelled orders/)).toBeTruthy()
  })

  it('says plainly that the list is a window onto something larger', () => {
    render(<CancelledOrders rows={rows} days={30} total={210} />)
    expect(screen.getByText('Showing the 200 most recent of 210')).toBeTruthy()
  })

  it('does not claim to be a window when it holds everything', () => {
    const three = rows.slice(0, 3)
    render(<CancelledOrders rows={three} days={30} total={3} />)
    expect(screen.getByText('3 listed, newest first')).toBeTruthy()
  })

  it('counts an unanswered cancellation rather than dropping it', () => {
    // A breakdown that silently omits the ones with no reason does not add up
    // to the total printed above it.
    render(<CancelledOrders rows={rows} days={30} total={200} />)
    const chips = [...document.querySelectorAll('.cancelled-reasons li')].map((li) =>
      li.textContent.replace(/\s+/g, ' ').trim(),
    )
    expect(chips.some((c) => c.startsWith('Not given'))).toBe(true)
    const counted = chips.reduce((sum, c) => sum + Number(c.match(/(\d+)$/)?.[1] ?? 0), 0)
    expect(counted).toBe(rows.length)
  })

  it('bounds its own height instead of becoming the page', () => {
    /* FOUND BY SCREENSHOT: 200 rows rendered inline made the sales page 25,000
       pixels tall the first time it met real data.
       Asserted against the STYLESHEET, not the DOM. jsdom applies no layout, so
       a rendered element proves only that the container exists — it would pass
       just as happily with the height cap deleted, which is the bug. The cap is
       the fix, so the cap is what this reads. */
    const { container } = render(<CancelledOrders rows={rows} days={30} total={200} />)
    expect(container.querySelector('.cancelled-scroll')).not.toBeNull()

    const css = readFileSync(
      join(import.meta.dirname, '..', '..', 'src', 'components', 'CancelledOrders.css'),
      'utf8',
    )
    const rule = css.slice(css.indexOf('.cancelled-scroll'))
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/max-block-size/)
  })

  it('says so, rather than showing an empty table, when nothing was cancelled', () => {
    render(<CancelledOrders rows={[]} days={30} total={0} />)
    expect(screen.getByText(/No orders were cancelled/)).toBeTruthy()
  })
})
