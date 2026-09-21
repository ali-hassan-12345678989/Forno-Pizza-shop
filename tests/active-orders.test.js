import { describe, expect, it } from 'vitest'

import { ORDER_STATUS, isFinal } from '../src/config/orderStatus.js'
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

describe('the open-order count is staff-only', () => {
  it('a guest cannot call it', async () => {
    const { error } = await anonClient().rpc('admin_active_orders')
    expect(error).toBeTruthy()
    expect(
      error.code,
      `refused with ${error.code} (${error.message}); a missing function errors too`,
    ).toBe(PERMISSION_DENIED)
  })

  it('a signed-in customer is refused by name', async () => {
    const { client } = await signedInClient(customerEmail)
    const { data, error } = await client.rpc('admin_active_orders')
    expect(error).toBeTruthy()
    expect(error.message).toContain('not_staff')
    expect(data).toBeNull()
  })
})

describe.skipIf(!staffConfigured())('what counts as open (FR-7.3)', () => {
  it('both staff roles can see it', async () => {
    const admin = await adminClient()
    const manager = await managerClient()
    expect((await admin.client.rpc('admin_active_orders')).error).toBeNull()
    expect((await manager.client.rpc('admin_active_orders')).error).toBeNull()
  })

  /**
   * order_is_active() reads the terminal status off order_status_flow(). If a
   * finished or cancelled order ever appears here, the SQL and the JS ladder
   * in src/config/orderStatus.js have drifted apart.
   */
  it('never counts a finished or cancelled order', async () => {
    const { client } = await adminClient()
    const { data } = await client.rpc('admin_active_orders')
    for (const g of data) {
      expect(isFinal(g.status), `${g.status} is a terminal status but is counted as open`).toBe(
        false,
      )
      expect(g.status).not.toBe(ORDER_STATUS.cancelled)
    }
  })

  it('a new order appears in the open count, and leaves it when cancelled', async () => {
    const admin = await adminClient()
    const customer = await signedInClient(customerEmail)

    const total = async () =>
      ((await admin.client.rpc('admin_active_orders')).data ?? []).reduce(
        (a, g) => a + Number(g.order_count),
        0,
      )

    const before = await total()
    const order = await placeOrderOrThrow(customer.client)
    const withOrder = await total()
    expect(withOrder, 'a freshly placed order is not being counted as open').toBe(before + 1)

    await customer.client.rpc('cancel_order', { p_access_token: order.access_token })
    expect(await total(), 'a cancelled order is still being counted as open').toBe(before)
  })

  it('groups carry a real stage, a type and a waiting-since time', async () => {
    const { client } = await adminClient()
    const { data } = await client.rpc('admin_active_orders')
    for (const g of data) {
      expect(Object.values(ORDER_STATUS)).toContain(g.status)
      expect(['delivery', 'pickup']).toContain(g.fulfillment_type)
      expect(Number(g.order_count)).toBeGreaterThan(0)
      expect(g.oldest_at, `${g.status} has no waiting-since time`).toBeTruthy()
    }
  })

  it('the longest-waiting group is listed first', async () => {
    const { client } = await adminClient()
    const { data } = await client.rpc('admin_active_orders')
    const times = data.map((g) => new Date(g.oldest_at).getTime())
    expect(times, 'oldest first').toEqual([...times].sort((a, b) => a - b))
  })
})

describe.skipIf(!staffConfigured())('the Admin sees inventory but cannot move it (FR-7.5)', () => {
  it('can read every ingredient', async () => {
    const { client } = await adminClient()
    const { data, error } = await client.rpc('staff_ingredients')
    expect(error).toBeNull()
    expect(data.length).toBeGreaterThan(0)
  })

  it('still cannot book stock in, however the page is drawn', async () => {
    const admin = await adminClient()
    const target = (await admin.client.rpc('staff_ingredients')).data[0]
    const before = Number(target.stock_quantity)

    const { error } = await admin.client.rpc('receive_stock', {
      p_ingredient_id: target.id,
      p_quantity: 1,
    })
    expect(error, 'FR-7.6: the Admin must never move stock').toBeTruthy()
    expect(error.message).toContain('not_manager')

    const after = (await admin.client.rpc('staff_ingredients')).data.find((r) => r.id === target.id)
    expect(Number(after.stock_quantity)).toBe(before)
  })
})
