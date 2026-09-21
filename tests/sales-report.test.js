import { describe, expect, it } from 'vitest'

import {
  ALL_REPORT_PERIODS,
  MAX_REPORT_PERIODS,
  REPORT_PERIODS,
  SHOP_TIME_ZONE,
} from '../src/config/reports.js'
import {
  adminClient,
  anonClient,
  managerClient,
  placeOrderOrThrow,
  signedInClient,
  staffConfigured,
} from './helpers/supabase.js'

const customerEmail = process.env.TEST_USER_A_EMAIL
const PERMISSION_DENIED = '42501'

/** Today, as the shop reckons it — which is what sales_report() buckets by. */
function todayInShopTime() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

describe('sales reports are staff-only', () => {
  it('a guest cannot call it', async () => {
    const { error } = await anonClient().rpc('sales_report', {
      p_period: REPORT_PERIODS.day,
      p_limit: 1,
    })
    expect(error).toBeTruthy()
    expect(
      error.code,
      `refused with ${error.code} (${error.message}); a missing function errors too`,
    ).toBe(PERMISSION_DENIED)
  })

  it('a signed-in customer is refused by name', async () => {
    const { client } = await signedInClient(customerEmail)
    const { data, error } = await client.rpc('sales_report', {
      p_period: REPORT_PERIODS.day,
      p_limit: 1,
    })
    expect(error).toBeTruthy()
    expect(error.message).toContain('not_staff')
    expect(data).toBeNull()
  })
})

describe.skipIf(!staffConfigured())('the three groupings FR-7.4 asks for', () => {
  it.each(ALL_REPORT_PERIODS)('%s works for the manager and the admin', async (period) => {
    const manager = await managerClient()
    const admin = await adminClient()

    const mine = await manager.client.rpc('sales_report', { p_period: period, p_limit: 5 })
    const theirs = await admin.client.rpc('sales_report', { p_period: period, p_limit: 5 })

    expect(mine.error, `manager, ${period}`).toBeNull()
    expect(theirs.error, `admin, ${period}`).toBeNull()
    expect(theirs.data).toEqual(mine.data)
  })

  it('rejects a grouping that is not one of the three', async () => {
    const { client } = await managerClient()
    for (const bad of ['week', 'hour', 'DAY', '', 'day; drop table orders']) {
      const { error } = await client.rpc('sales_report', { p_period: bad, p_limit: 5 })
      expect(error?.message, `"${bad}" should be rejected`).toContain('invalid_period')
    }
  })

  it('rejects a nonsensical window', async () => {
    const { client } = await managerClient()
    for (const bad of [0, -1, MAX_REPORT_PERIODS + 1]) {
      const { error } = await client.rpc('sales_report', {
        p_period: REPORT_PERIODS.day,
        p_limit: bad,
      })
      expect(error?.message, `limit ${bad} should be rejected`).toContain('invalid_limit')
    }
  })

  it('accepts the largest window it advertises', async () => {
    const { client } = await managerClient()
    const { error } = await client.rpc('sales_report', {
      p_period: REPORT_PERIODS.day,
      p_limit: MAX_REPORT_PERIODS,
    })
    expect(error, 'the JS cap and the SQL cap have drifted apart').toBeNull()
  })
})

describe.skipIf(!staffConfigured())('what the numbers mean', () => {
  it('buckets are distinct and newest first', async () => {
    const { client } = await managerClient()
    const { data } = await client.rpc('sales_report', { p_period: REPORT_PERIODS.day, p_limit: 30 })
    const starts = data.map((r) => r.period_start)
    expect(new Set(starts).size, 'a period appears twice').toBe(starts.length)
    expect(starts).toEqual([...starts].sort().reverse())
  })

  it('revenue is never less than goods revenue', async () => {
    const { client } = await managerClient()
    const { data } = await client.rpc('sales_report', { p_period: REPORT_PERIODS.day, p_limit: 30 })
    for (const r of data) {
      expect(
        Number(r.revenue),
        `${r.period_start}: total is below subtotal, which cannot happen`,
      ).toBeGreaterThanOrEqual(Number(r.goods_revenue))
    }
  })

  it('yearly totals equal the monthly ones rolled up', async () => {
    const { client } = await managerClient()
    const months = (
      await client.rpc('sales_report', { p_period: REPORT_PERIODS.month, p_limit: 12 })
    ).data
    const years = (await client.rpc('sales_report', { p_period: REPORT_PERIODS.year, p_limit: 5 }))
      .data

    for (const y of years) {
      const yr = y.period_start.slice(0, 4)
      const covered = months.filter((m) => m.period_start.startsWith(yr))
      // Only compare a year whose months are all inside the 12-month window.
      if (covered.length === 0) continue
      const monthly = covered.reduce((a, m) => a + Number(m.order_count), 0)
      if (monthly === Number(y.order_count)) {
        expect(
          covered.reduce((a, m) => a + Number(m.revenue), 0),
          `${yr}: months and year disagree on revenue`,
        ).toBeCloseTo(Number(y.revenue), 2)
      }
    }
  })

  /**
   * The grouping is cut in Asia/Karachi. In UTC, anything ordered after 7pm
   * Pakistan time lands on the following day — so an order placed now must
   * appear under today's Pakistani date, not tomorrow's.
   */
  it("a new order lands in today's bucket, shop time", async () => {
    const { client } = await managerClient()
    const customer = await signedInClient(customerEmail)
    const today = todayInShopTime()

    const before =
      (await client.rpc('sales_report', { p_period: REPORT_PERIODS.day, p_limit: 3 })).data.find(
        (r) => r.period_start === today,
      )?.order_count ?? 0

    await placeOrderOrThrow(customer.client)

    const after = (
      await client.rpc('sales_report', { p_period: REPORT_PERIODS.day, p_limit: 3 })
    ).data.find((r) => r.period_start === today)

    expect(after, `no bucket for ${today} (${SHOP_TIME_ZONE})`).toBeTruthy()
    expect(Number(after.order_count)).toBe(Number(before) + 1)
  })

  /**
   * A cancelled order gave its stock back, so counting it as revenue would
   * make the sales figures disagree with the inventory they are meant to
   * explain — the exact cross-check FR-6.4 exists for.
   */
  it('a cancelled order leaves revenue alone but is still counted', async () => {
    const { client } = await managerClient()
    const customer = await signedInClient(customerEmail)
    const today = todayInShopTime()

    const bucket = async () =>
      (await client.rpc('sales_report', { p_period: REPORT_PERIODS.day, p_limit: 3 })).data.find(
        (r) => r.period_start === today,
      ) ?? { order_count: 0, revenue: 0, cancelled_count: 0 }

    const order = await placeOrderOrThrow(customer.client)
    const placed = await bucket()

    await customer.client.rpc('cancel_order', { p_access_token: order.access_token })
    const cancelled = await bucket()

    expect(Number(cancelled.order_count), 'the cancelled order still counts as a sale').toBe(
      Number(placed.order_count) - 1,
    )
    expect(Number(cancelled.cancelled_count)).toBe(Number(placed.cancelled_count) + 1)
    expect(Number(cancelled.revenue)).toBeLessThan(Number(placed.revenue))
  })
})
