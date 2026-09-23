import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ORDER_STATUS } from '../src/config/orderStatus.js'
import { STAFF_ROLES } from '../src/config/staff.js'
import {
  adminClient,
  anonClient,
  chefClient,
  chefConfigured,
  managerClient,
  placeOrderOrThrow,
  releasePlacedOrders,
  signedInClient,
  staffConfigured,
} from './helpers/supabase.js'

/**
 * The kitchen: the chef role, what it can see, and what it can move.
 *
 * The important tests here are the negative ones. Until this feature,
 * set_order_status() was revoked from everyone — nothing could call it, which
 * is a kind of safety. Opening it to a role means the role check inside is now
 * the only thing standing between a signed-in customer and marking their own
 * order delivered.
 */

const customerEmail = process.env.TEST_USER_A_EMAIL

let chef
let admin
let manager

/** An order placed fresh, so its stage is known rather than assumed. */
async function freshOrder(overrides = {}) {
  return placeOrderOrThrow(anonClient(), { name: 'Kitchen Probe', ...overrides })
}

beforeAll(async () => {
  if (!staffConfigured() || !chefConfigured()) return
  chef = (await chefClient()).client
  admin = (await adminClient()).client
  manager = (await managerClient()).client
}, 30_000)

afterAll(async () => {
  await releasePlacedOrders()
})

describe('the chef role exists and is held by one account', () => {
  it('staff_role() reports chef', async () => {
    if (!chefConfigured()) return
    const { data, error } = await chef.rpc('staff_role')
    expect(error).toBeNull()
    expect(data).toBe(STAFF_ROLES.chef)
  })

  it('is_chef() is true for the chef and false for the others', async () => {
    if (!staffConfigured() || !chefConfigured()) return

    expect((await chef.rpc('is_chef')).data).toBe(true)
    expect((await admin.rpc('is_chef')).data).toBe(false)
    expect((await manager.rpc('is_chef')).data).toBe(false)

    const { client: customer } = await signedInClient(customerEmail)
    expect((await customer.rpc('is_chef')).data).toBe(false)
  })

  it('does not make the chef a Manager or an Admin', async () => {
    if (!chefConfigured()) return
    expect((await chef.rpc('is_manager')).data).toBe(false)
    expect((await chef.rpc('is_admin')).data).toBe(false)
  })
})

describe('who can see the kitchen', () => {
  it('refuses an anonymous caller', async () => {
    const { error } = await anonClient().rpc('chef_orders')
    expect(error).toBeTruthy()
  })

  it('refuses a signed-in customer', async () => {
    const { client } = await signedInClient(customerEmail)
    const { error } = await client.rpc('chef_orders')
    expect(error?.message).toBe('not_kitchen')
  })

  it('refuses the Manager, whose job is stock', async () => {
    if (!staffConfigured()) return
    const { error } = await manager.rpc('chef_orders')
    expect(error?.message).toBe('not_kitchen')
  })

  it('allows the chef', async () => {
    if (!chefConfigured()) return
    const { data, error } = await chef.rpc('chef_orders')
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('allows the Admin, who is the fallback when the kitchen cannot sign in', async () => {
    if (!staffConfigured()) return
    const { error } = await admin.rpc('chef_orders')
    expect(error).toBeNull()
  })
})

describe('what the kitchen screen carries', () => {
  it('lists a new order with what to make', async () => {
    if (!chefConfigured()) return
    const order = await freshOrder()

    const { data } = await chef.rpc('chef_orders')
    const row = data.find((r) => r.order_number === order.order.order_number)

    expect(row).toBeTruthy()
    expect(row.status).toBe(ORDER_STATUS.placed)
    expect(row.customer_name).toBe('Kitchen Probe')
    expect(Number(row.item_count)).toBeGreaterThan(0)
    expect(Array.isArray(row.items)).toBe(true)
    expect(row.items[0].name).toBeTruthy()
    expect(row.items[0].size).toBeTruthy()
    expect(Number(row.items[0].quantity)).toBeGreaterThan(0)
  })

  it('carries no phone number, address or access token', async () => {
    if (!chefConfigured()) return
    const order = await freshOrder()

    const { data } = await chef.rpc('chef_orders')
    const row = data.find((r) => r.order_number === order.order.order_number)

    // A kitchen screen sits on a counter all evening. It needs to know what to
    // cook, not where anyone lives.
    expect(row).not.toHaveProperty('customer_phone')
    expect(row).not.toHaveProperty('delivery_address')
    expect(row).not.toHaveProperty('access_token')
    expect(JSON.stringify(data)).not.toContain(order.access_token)
  })

  it('offers the one stage each order can actually move to', async () => {
    if (!chefConfigured()) return
    const delivery = await freshOrder({ fulfillmentType: 'delivery' })
    const pickup = await freshOrder({ fulfillmentType: 'pickup', address: null })

    const { data } = await chef.rpc('chef_orders')
    const d = data.find((r) => r.order_number === delivery.order.order_number)
    const p = data.find((r) => r.order_number === pickup.order.order_number)

    // Both are at 'placed', so both go to 'preparing' next — the ladders have
    // not diverged yet. What matters is that the value comes from the order's
    // own flow rather than a single hardcoded "next".
    expect(d.next_status).toBe(ORDER_STATUS.preparing)
    expect(p.next_status).toBe(ORDER_STATUS.preparing)
  })

  it('shows the oldest order first', async () => {
    if (!chefConfigured()) return
    await freshOrder()

    const { data } = await chef.rpc('chef_orders')
    const times = data.map((r) => new Date(r.created_at).getTime())

    // The opposite of every other list in this product, and on purpose: the
    // order that has waited longest is the one the kitchen should look at.
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it('drops an order once it is finished', async () => {
    if (!chefConfigured()) return
    const order = await freshOrder({ fulfillmentType: 'pickup', address: null })
    const id = order.order.id

    for (const next of [
      ORDER_STATUS.preparing,
      ORDER_STATUS.readyForPickup,
      ORDER_STATUS.pickedUp,
    ]) {
      const { error } = await chef.rpc('set_order_status', { p_order_id: id, p_status: next })
      expect(error).toBeNull()
    }

    const { data } = await chef.rpc('chef_orders')
    expect(data.find((r) => r.order_number === order.order.order_number)).toBeUndefined()
  })
})

describe('moving an order along', () => {
  it('lets the chef advance it, and the customer sees the same stage', async () => {
    if (!chefConfigured()) return
    const order = await freshOrder()

    const { error } = await chef.rpc('set_order_status', {
      p_order_id: order.order.id,
      p_status: ORDER_STATUS.preparing,
    })
    expect(error).toBeNull()

    // The whole point of the feature: the tracker the customer is watching.
    const { data: tracked } = await anonClient().rpc('get_order_by_token', {
      p_access_token: order.access_token,
    })
    expect(tracked.order.status).toBe(ORDER_STATUS.preparing)

    // And the trail records it, without the chef writing to that table.
    const stages = tracked.status_history.map((h) => h.status)
    expect(stages).toContain(ORDER_STATUS.placed)
    expect(stages).toContain(ORDER_STATUS.preparing)
  })

  it('lets the Admin advance it too', async () => {
    if (!staffConfigured()) return
    const order = await freshOrder()
    const { error } = await admin.rpc('set_order_status', {
      p_order_id: order.order.id,
      p_status: ORDER_STATUS.preparing,
    })
    expect(error).toBeNull()
  })
})

describe('who cannot move an order — the tests that matter most', () => {
  it('refuses an anonymous caller', async () => {
    const order = await freshOrder()
    const { error } = await anonClient().rpc('set_order_status', {
      p_order_id: order.order.id,
      p_status: ORDER_STATUS.delivered,
    })
    expect(error).toBeTruthy()
  })

  it('refuses a signed-in customer their own order', async () => {
    // Before this feature set_order_status() was revoked from everyone, so
    // nothing could reach it. It is now granted to `authenticated`, which means
    // the check inside is the only thing stopping a customer marking their own
    // dinner delivered.
    const { client } = await signedInClient(customerEmail)
    const order = await placeOrderOrThrow(client, { name: 'Self Serve Probe' })

    const { error } = await client.rpc('set_order_status', {
      p_order_id: order.order.id,
      p_status: ORDER_STATUS.delivered,
    })
    expect(error?.message).toBe('not_kitchen')

    const { data: still } = await anonClient().rpc('get_order_by_token', {
      p_access_token: order.access_token,
    })
    expect(still.order.status).toBe(ORDER_STATUS.placed)
  })

  it('refuses the Manager', async () => {
    if (!staffConfigured()) return
    const order = await freshOrder()
    const { error } = await manager.rpc('set_order_status', {
      p_order_id: order.order.id,
      p_status: ORDER_STATUS.preparing,
    })
    expect(error?.message).toBe('not_kitchen')
  })

  it('refuses advance_order_status() to a customer as well', async () => {
    const { client } = await signedInClient(customerEmail)
    const order = await placeOrderOrThrow(client, { name: 'Self Serve Probe' })

    const { error } = await client.rpc('advance_order_status', {
      p_order_number: order.order.order_number,
    })
    expect(error?.message).toBe('not_kitchen')
  })
})

describe('the ladder still holds for the chef', () => {
  it('refuses to go backwards', async () => {
    if (!chefConfigured()) return
    const order = await freshOrder()
    const id = order.order.id

    await chef.rpc('set_order_status', { p_order_id: id, p_status: ORDER_STATUS.preparing })
    const { error } = await chef.rpc('set_order_status', {
      p_order_id: id,
      p_status: ORDER_STATUS.placed,
    })
    expect(error?.message).toBe('status_not_forward')
  })

  it('refuses a stage from the other ladder', async () => {
    if (!chefConfigured()) return
    const pickup = await freshOrder({ fulfillmentType: 'pickup', address: null })

    const { error } = await chef.rpc('set_order_status', {
      p_order_id: pickup.order.id,
      p_status: ORDER_STATUS.outForDelivery,
    })
    expect(error?.message).toBe('invalid_status')
  })

  it('refuses to reopen a cancelled order', async () => {
    if (!chefConfigured()) return
    const anon = anonClient()
    const order = await placeOrderOrThrow(anon, { name: 'Kitchen Probe' })
    await anon.rpc('cancel_order', { p_access_token: order.access_token })

    const { error } = await chef.rpc('set_order_status', {
      p_order_id: order.order.id,
      p_status: ORDER_STATUS.preparing,
    })
    expect(error?.message).toBe('order_cancelled')
  })

  it('refuses the same move twice, which is how two screens stay honest', async () => {
    if (!chefConfigured() || !staffConfigured()) return
    const order = await freshOrder()

    const first = await chef.rpc('set_order_status', {
      p_order_id: order.order.id,
      p_status: ORDER_STATUS.preparing,
    })
    expect(first.error).toBeNull()

    // The Admin's screen still showed 'placed' and offered the same button.
    const second = await admin.rpc('set_order_status', {
      p_order_id: order.order.id,
      p_status: ORDER_STATUS.preparing,
    })
    expect(second.error?.message).toBe('status_not_forward')
  })
})

describe('the chef is confined to the kitchen', () => {
  it('cannot read the Admin order list, with its phone numbers', async () => {
    if (!chefConfigured()) return
    const { error } = await chef.rpc('admin_orders', {})
    expect(error?.message).toBe('not_admin')
  })

  it('cannot open one order in full', async () => {
    if (!chefConfigured()) return
    const order = await freshOrder()
    const { error } = await chef.rpc('admin_order_detail', { p_order_id: order.order.id })
    expect(error?.message).toBe('not_admin')
  })

  it('cannot read stock, usage or sales', async () => {
    if (!chefConfigured()) return
    for (const [fn, args] of [
      ['staff_ingredients', {}],
      ['staff_ingredient_usage', {}],
      ['sales_report', { p_period: 'day', p_limit: 7 }],
    ]) {
      const { error } = await chef.rpc(fn, args)
      expect(error?.message).toBe('not_staff')
    }
  })

  it('cannot book in stock or edit the menu', async () => {
    if (!chefConfigured()) return

    const bookIn = await chef.rpc('receive_stock', {
      p_ingredient_id: '33333333-3333-3333-3333-333333333333',
      p_quantity: 1,
    })
    expect(bookIn.error?.message).toBe('not_manager')

    const menu = await chef.rpc('admin_menu_items')
    expect(menu.error?.message).toBe('not_admin')
  })

  it('cannot cancel an order and hand the stock back', async () => {
    if (!chefConfigured()) return
    const order = await freshOrder()

    // cancel_order() takes the customer's access token, which the chef never
    // sees. Holding an order id is not authorisation to refund it.
    const { error } = await chef.rpc('cancel_order', { p_access_token: order.order.id })
    expect(error).toBeTruthy()
  })
})
