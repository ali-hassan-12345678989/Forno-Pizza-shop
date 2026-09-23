import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MAX_ADMIN_ORDERS } from '../src/config/adminOrders.js'
import {
  adminClient,
  anonClient,
  managerClient,
  placeOrderOrThrow,
  releasePlacedOrders,
  signedInClient,
  staffConfigured,
} from './helpers/supabase.js'

/**
 * The Admin reading real orders (admin_orders / admin_order_detail).
 *
 * These place real orders, because that is the only honest way to test a
 * reader: a fixture row inserted behind place_order() would not have lines,
 * extras or a status trail, and would prove nothing about what the Admin
 * actually sees. releasePlacedOrders() hands the stock back afterwards.
 */

const customerEmail = process.env.TEST_USER_A_EMAIL

let admin
let guestOrder
let accountOrder

beforeAll(async () => {
  if (!staffConfigured()) return

  admin = (await adminClient()).client

  const anon = anonClient()
  guestOrder = await placeOrderOrThrow(anon, { name: 'Guest Probe' })

  const { client: customer } = await signedInClient(customerEmail)
  accountOrder = await placeOrderOrThrow(customer, { name: 'Account Probe' })
}, 30_000)

afterAll(async () => {
  await releasePlacedOrders()
})

const rowFor = (rows, orderNumber) => rows.find((row) => row.order_number === orderNumber)

describe('reading orders is Admin-only', () => {
  const calls = [
    ['admin_orders', {}],
    ['admin_order_detail', { p_order_id: '00000000-0000-0000-0000-000000000000' }],
  ]

  it.each(calls)('refuses an anonymous caller: %s', async (fn, args) => {
    const { error } = await anonClient().rpc(fn, args)
    expect(error).toBeTruthy()
  })

  it.each(calls)('refuses a signed-in customer: %s', async (fn, args) => {
    const { client } = await signedInClient(customerEmail)
    const { error } = await client.rpc(fn, args)
    expect(error?.message).toBe('not_admin')
  })

  it.each(calls)('refuses the Manager: %s', async (fn, args) => {
    if (!staffConfigured()) return
    const { client } = await managerClient()
    const { error } = await client.rpc(fn, args)
    // The Manager sees counts (admin_active_orders) but not customer contact
    // details. Least privilege, and FR-6.4's cross-check needs neither.
    expect(error?.message).toBe('not_admin')
  })

  it('allows the Admin', async () => {
    if (!staffConfigured()) return
    const { data, error } = await admin.rpc('admin_orders', {})
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })
})

describe('the list', () => {
  it('includes both orders just placed', async () => {
    if (!staffConfigured()) return
    const { data } = await admin.rpc('admin_orders', {})

    expect(rowFor(data, guestOrder.order.order_number)).toBeTruthy()
    expect(rowFor(data, accountOrder.order.order_number)).toBeTruthy()
  })

  it('comes back newest first', async () => {
    if (!staffConfigured()) return
    const { data } = await admin.rpc('admin_orders', {})
    const times = data.map((row) => new Date(row.created_at).getTime())

    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it('counts units, not lines', async () => {
    if (!staffConfigured()) return
    // Two of the same size is one line and two items. A count of lines would
    // report "1 item" for an order of two pizzas.
    const anon = anonClient()
    const twoOfOne = await placeOrderOrThrow(anon, { name: 'Count Probe' }, [
      { size_id: '22222222-2222-2222-2222-222222222222', quantity: 2 },
    ])

    const { data } = await admin.rpc('admin_orders', {})
    const row = rowFor(data, twoOfOne.order.order_number)

    expect(row.item_count).toBe(2)
  })

  it('says whether an order belongs to an account, without saying whose', async () => {
    if (!staffConfigured()) return
    const { data } = await admin.rpc('admin_orders', {})

    expect(rowFor(data, guestOrder.order.order_number).has_account).toBe(false)
    expect(rowFor(data, accountOrder.order.order_number).has_account).toBe(true)

    // The list is for scanning. No contact detail is in this payload at all.
    const row = rowFor(data, accountOrder.order.order_number)
    expect(row).not.toHaveProperty('customer_phone')
    expect(row).not.toHaveProperty('delivery_address')
    expect(row).not.toHaveProperty('email')
  })

  it('never hands over an access token', async () => {
    if (!staffConfigured()) return
    const { data } = await admin.rpc('admin_orders', {})

    for (const row of data) expect(row).not.toHaveProperty('access_token')
    expect(JSON.stringify(data)).not.toContain(guestOrder.access_token)
  })

  it('marks a fresh order active', async () => {
    if (!staffConfigured()) return
    const { data } = await admin.rpc('admin_orders', {})

    expect(rowFor(data, guestOrder.order.order_number).is_active).toBe(true)
  })

  it('applies the limit to finished orders', async () => {
    if (!staffConfigured()) return
    const { data } = await admin.rpc('admin_orders', { p_limit: 1 })
    const finished = data.filter((row) => !row.is_active)

    // At most the one the limit allows. Open orders are counted separately
    // by the test below, which is the whole point of the rule.
    expect(finished.length).toBeLessThanOrEqual(1)
  })

  it('never hides an order that is still in progress, however small the limit', async () => {
    if (!staffConfigured()) return

    // The bug this guards: a plain "newest N" buried six open orders behind
    // ninety-seven cancelled ones. The sidebar badge counts open orders across
    // the whole table, so the list has to contain every one of them or the two
    // screens contradict each other — and the buried order is precisely the one
    // someone is hunting for.
    const { data: groups } = await admin.rpc('admin_active_orders')
    const openEverywhere = groups.reduce((n, g) => n + Number(g.order_count), 0)

    const { data: tiny } = await admin.rpc('admin_orders', { p_limit: 1 })
    const openInList = tiny.filter((row) => row.is_active).length

    expect(openEverywhere).toBeGreaterThan(1) // the test placed several
    expect(openInList).toBe(openEverywhere)

    // And the two orders this file placed are both in there.
    const numbers = tiny.map((row) => row.order_number)
    expect(numbers).toContain(guestOrder.order.order_number)
    expect(numbers).toContain(accountOrder.order.order_number)
  })

  it('refuses a limit the screen should never send', async () => {
    if (!staffConfigured()) return

    for (const bad of [0, -1, MAX_ADMIN_ORDERS + 1, null]) {
      const { error } = await admin.rpc('admin_orders', { p_limit: bad })
      expect(error?.message).toBe('invalid_limit')
    }
  })

  it('allows exactly the largest limit it documents', async () => {
    if (!staffConfigured()) return
    const { error } = await admin.rpc('admin_orders', { p_limit: MAX_ADMIN_ORDERS })
    expect(error).toBeNull()
  })
})

describe('one order in full', () => {
  it('returns the lines, with names and quantities', async () => {
    if (!staffConfigured()) return
    const { data } = await admin.rpc('admin_order_detail', { p_order_id: guestOrder.order.id })

    expect(data.order.order_number).toBe(guestOrder.order.order_number)
    expect(data.items.length).toBeGreaterThan(0)

    const line = data.items[0]
    expect(line.item_name).toBeTruthy()
    expect(line.size_label).toBeTruthy()
    expect(line.quantity).toBeGreaterThan(0)
    expect(Array.isArray(line.toppings)).toBe(true)
  })

  it('never includes the access token or the stock flag', async () => {
    if (!staffConfigured()) return
    const { data } = await admin.rpc('admin_order_detail', { p_order_id: guestOrder.order.id })

    expect(data.order).not.toHaveProperty('access_token')
    expect(data.order).not.toHaveProperty('stock_deducted')
    // Belt and braces: the token must not appear anywhere in the payload.
    expect(JSON.stringify(data)).not.toContain(guestOrder.access_token)
  })

  it('carries the name and phone even for a guest, because delivery needs them', async () => {
    if (!staffConfigured()) return
    const { data } = await admin.rpc('admin_order_detail', { p_order_id: guestOrder.order.id })

    expect(data.order.customer_name).toBe('Guest Probe')
    expect(data.order.customer_phone).toBeTruthy()
  })

  it('has no account block for a guest', async () => {
    if (!staffConfigured()) return
    const { data } = await admin.rpc('admin_order_detail', { p_order_id: guestOrder.order.id })

    expect(data.account).toBeNull()
  })

  it('has an account block, with an email, for a signed-in customer', async () => {
    if (!staffConfigured()) return
    const { data } = await admin.rpc('admin_order_detail', { p_order_id: accountOrder.order.id })

    expect(data.account).toBeTruthy()
    expect(data.account.email).toBe(customerEmail)
    expect(Number(data.account.order_count)).toBeGreaterThanOrEqual(1)
  })

  it('takes only the email from auth.users, nothing else', async () => {
    if (!staffConfigured()) return
    const { data } = await admin.rpc('admin_order_detail', { p_order_id: accountOrder.order.id })

    // auth.users holds password hashes and recovery tokens; a SECURITY DEFINER
    // function can read all of it, so it must name the one column it needs.
    expect(Object.keys(data.account).sort()).toEqual(['email', 'order_count'])
  })

  it('returns the status trail', async () => {
    if (!staffConfigured()) return
    const { data } = await admin.rpc('admin_order_detail', { p_order_id: guestOrder.order.id })

    expect(Array.isArray(data.status_history)).toBe(true)
    expect(data.status_history[0].status).toBe('placed')
  })

  it('raises order_not_found for an id that is not an order', async () => {
    if (!staffConfigured()) return
    const { error } = await admin.rpc('admin_order_detail', {
      p_order_id: '00000000-0000-0000-0000-000000000000',
    })

    expect(error?.message).toBe('order_not_found')
  })
})
