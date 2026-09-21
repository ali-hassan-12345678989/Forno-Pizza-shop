import { describe, expect, it } from 'vitest'

import {
  adminClient,
  anonClient,
  managerClient,
  signedInClient,
  staffConfigured,
} from './helpers/supabase.js'

const customerEmail = process.env.TEST_USER_A_EMAIL

/**
 * Postgres refuses with 42501 when a role lacks EXECUTE. A function that does
 * not exist comes back as PGRST202. Pinning the code keeps these from passing
 * against a database where staff_inventory.sql was never run.
 */
const PERMISSION_DENIED = '42501'

describe('stock levels are staff-only', () => {
  it('a guest cannot call it', async () => {
    const { error } = await anonClient().rpc('staff_ingredients')
    expect(error, 'expected a refusal').toBeTruthy()
    expect(
      error.code,
      `refused with ${error.code} (${error.message}); a missing function ` +
        'would also error, which would make this vacuous',
    ).toBe(PERMISSION_DENIED)
  })

  it('a signed-in customer is refused by name', async () => {
    const { client } = await signedInClient(customerEmail)
    const { data, error } = await client.rpc('staff_ingredients')
    expect(error).toBeTruthy()
    expect(error.message).toContain('not_staff')
    expect(data).toBeNull()
  })

  it('the ingredients table itself is still sealed', async () => {
    const { client } = await signedInClient(customerEmail)
    const { data, error } = await client.from('ingredients').select('*')
    expect(error, 'ingredients must stay unreadable directly').toBeTruthy()
    expect(data).toBeNull()
  })
})

describe.skipIf(!staffConfigured())('what staff see', () => {
  it('the manager gets every ingredient (FR-6.3)', async () => {
    const { client } = await managerClient()
    const { data, error } = await client.rpc('staff_ingredients')
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('the admin sees the same list, read-only (FR-7.5)', async () => {
    const manager = await managerClient()
    const admin = await adminClient()
    const mine = (await manager.client.rpc('staff_ingredients')).data
    const theirs = (await admin.client.rpc('staff_ingredients')).data
    expect(theirs.map((r) => r.id)).toEqual(mine.map((r) => r.id))
  })

  it('every row carries a name, a unit and a number', async () => {
    const { client } = await managerClient()
    const { data } = await client.rpc('staff_ingredients')
    for (const row of data) {
      expect(row.name, 'ingredient with no name').toBeTruthy()
      expect(row.unit, `${row.name} has no unit`).toBeTruthy()
      expect(Number.isFinite(Number(row.stock_quantity))).toBe(true)
    }
  })

  /**
   * is_low here and note_stock_level() in deduct_stock.sql must agree on what
   * "low" means. If they drift, the panel shows green while an alert sits in
   * stock_alerts — the kind of mismatch nobody notices until a Saturday.
   */
  it('is_low means exactly "below the threshold"', async () => {
    const { client } = await managerClient()
    const { data } = await client.rpc('staff_ingredients')
    for (const row of data) {
      const expected = Number(row.stock_quantity) < Number(row.low_stock_threshold)
      expect(
        row.is_low,
        `${row.name}: stock ${row.stock_quantity} vs threshold ${row.low_stock_threshold}`,
      ).toBe(expected)
    }
  })

  it('is_out means exactly zero', async () => {
    const { client } = await managerClient()
    const { data } = await client.rpc('staff_ingredients')
    for (const row of data) {
      expect(row.is_out, `${row.name} at ${row.stock_quantity}`).toBe(
        Number(row.stock_quantity) === 0,
      )
    }
  })

  it('the most urgent rows come first', async () => {
    const { client } = await managerClient()
    const { data } = await client.rpc('staff_ingredients')
    const rank = (r) => (r.is_out ? 0 : r.is_low ? 1 : 2)
    const ranks = data.map(rank)
    expect(ranks, 'out of stock, then low, then the rest').toEqual([...ranks].sort((a, b) => a - b))

    // and alphabetical inside each band
    for (let i = 1; i < data.length; i += 1) {
      if (rank(data[i]) !== rank(data[i - 1])) continue
      expect(
        data[i].name.localeCompare(data[i - 1].name),
        `${data[i - 1].name} should not come before ${data[i].name}`,
      ).toBeGreaterThanOrEqual(0)
    }
  })
})
