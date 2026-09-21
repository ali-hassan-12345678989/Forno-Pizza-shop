import { describe, expect, it } from 'vitest'

import {
  adminClient,
  anonClient,
  managerClient,
  signedInClient,
  staffConfigured,
} from './helpers/supabase.js'

const customerEmail = process.env.TEST_USER_A_EMAIL
const PERMISSION_DENIED = '42501'

describe('stock alerts are staff-only', () => {
  it('a guest cannot call it', async () => {
    const { error } = await anonClient().rpc('staff_stock_alerts')
    expect(error).toBeTruthy()
    expect(
      error.code,
      `refused with ${error.code} (${error.message}); a missing function errors too`,
    ).toBe(PERMISSION_DENIED)
  })

  it('a signed-in customer is refused by name', async () => {
    const { client } = await signedInClient(customerEmail)
    const { data, error } = await client.rpc('staff_stock_alerts')
    expect(error).toBeTruthy()
    expect(error.message).toContain('not_staff')
    expect(data).toBeNull()
  })

  it('the stock_alerts table itself is still sealed', async () => {
    const { client } = await signedInClient(customerEmail)
    const { data, error } = await client.from('stock_alerts').select('*')
    expect(error, 'stock_alerts must stay unreadable directly').toBeTruthy()
    expect(data).toBeNull()
  })
})

describe.skipIf(!staffConfigured())('what staff see', () => {
  it('the manager can read them (FR-5.4)', async () => {
    const { client } = await managerClient()
    const { data, error } = await client.rpc('staff_stock_alerts')
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('the admin sees the same list (FR-5.4 says Manager and/or Admin)', async () => {
    const manager = await managerClient()
    const admin = await adminClient()
    const mine = (await manager.client.rpc('staff_stock_alerts')).data
    const theirs = (await admin.client.rpc('staff_stock_alerts')).data
    expect(theirs.map((a) => a.id)).toEqual(mine.map((a) => a.id))
  })

  /**
   * The whole list is meant to be self-clearing: note_stock_level() closes an
   * alert when a delivery lifts the ingredient back over its threshold. If a
   * row comes back that is no longer below, a crossing was missed and the
   * Manager is being shown a warning that stopped being true.
   */
  it('every open alert is genuinely still below its threshold', async () => {
    const { client } = await managerClient()
    const { data } = await client.rpc('staff_stock_alerts')
    for (const a of data) {
      expect(
        a.still_below,
        `${a.ingredient_name}: ${a.current_stock} vs threshold ${a.low_stock_threshold} — ` +
          'an open alert on a healthy ingredient means a crossing was missed',
      ).toBe(true)
      expect(Number(a.current_stock)).toBeLessThan(Number(a.low_stock_threshold))
    }
  })

  it('every alert names a real ingredient with a unit', async () => {
    const { client } = await managerClient()
    const { data } = await client.rpc('staff_stock_alerts')
    for (const a of data) {
      expect(a.ingredient_name).toBeTruthy()
      expect(a.unit).toBeTruthy()
      expect(a.triggered_at).toBeTruthy()
    }
  })

  it('the most urgent come first', async () => {
    const { client } = await managerClient()
    const { data } = await client.rpc('staff_stock_alerts')
    const rank = (a) => (Number(a.current_stock) === 0 ? 0 : 1)
    const ranks = data.map(rank)
    expect(ranks, 'out of stock before merely low').toEqual([...ranks].sort((x, y) => x - y))
  })

  /**
   * Cross-check against the other reader. An ingredient the stock table calls
   * low, with no open alert, means Part 3 never noticed the crossing — which
   * is exactly the failure this screen exists to make visible.
   */
  it('agrees with the stock table about what is low', async () => {
    const { client } = await managerClient()
    const stock = (await client.rpc('staff_ingredients')).data
    const alerts = (await client.rpc('staff_stock_alerts')).data

    const alerting = new Set(alerts.map((a) => a.ingredient_id))
    const lowWithoutAlert = stock.filter((i) => i.is_low && !alerting.has(i.id)).map((i) => i.name)

    expect(
      lowWithoutAlert,
      'these are below their threshold but have no open alert — a crossing was missed, ' +
        'or they were seeded low and never crossed',
    ).toEqual([])
  })
})
