import { afterAll, describe, expect, it } from 'vitest'

import {
  MAX_ITEM_DESCRIPTION,
  MAX_ITEM_NAME,
  MAX_ITEM_PRICE,
  MAX_SHORT_TEXT,
} from '../src/config/menuAdmin.js'
import {
  adminClient,
  anonClient,
  managerClient,
  signedInClient,
  staffConfigured,
} from './helpers/supabase.js'

const customerEmail = process.env.TEST_USER_A_EMAIL
const PERMISSION_DENIED = '42501'

/** Scratch items this file created, removed in afterAll however it ends. */
const scratch = []

async function makeItem(client, overrides = {}) {
  const { data, error } = await client.rpc('admin_save_menu_item', {
    p_id: null,
    p_name: `ZZ Test Item ${Math.random().toString(36).slice(2, 8)}`,
    p_description: 'created by the test suite',
    p_image_url: null,
    p_category: null,
    p_badge: null,
    p_sort_order: 9999,
    // Never active: a live test item would appear on the real customer menu.
    p_is_active: false,
    p_is_sold_out: false,
    ...overrides,
  })
  if (error) throw new Error(`could not create scratch item: ${error.message}`)
  scratch.push({ client, id: data })
  return data
}

afterAll(async () => {
  for (const { client, id } of scratch.splice(0)) {
    await client.rpc('admin_delete_menu_item', { p_id: id })
  }
})

describe('menu editing is Admin-only', () => {
  const calls = [
    ['admin_menu_items', {}],
    [
      'admin_save_menu_item',
      {
        p_id: null,
        p_name: 'x',
        p_description: null,
        p_image_url: null,
        p_category: null,
        p_badge: null,
        p_sort_order: 0,
        p_is_active: false,
        p_is_sold_out: false,
      },
    ],
    ['admin_delete_menu_item', { p_id: '00000000-0000-4000-8000-000000000000' }],
    [
      'admin_save_menu_size',
      {
        p_id: null,
        p_menu_item_id: '00000000-0000-4000-8000-000000000000',
        p_size: 'x',
        p_price: 1,
        p_serves: null,
        p_sort_order: 0,
      },
    ],
    ['admin_delete_menu_size', { p_id: '00000000-0000-4000-8000-000000000000' }],
  ]

  it.each(calls)('a guest cannot call %s', async (fn, args) => {
    const { error } = await anonClient().rpc(fn, args)
    expect(error, `${fn} should be refused`).toBeTruthy()
    expect(error.code, `${fn} refused with ${error.code}: ${error.message}`).toBe(PERMISSION_DENIED)
  })

  it.each(calls)('a customer cannot call %s', async (fn, args) => {
    const { client } = await signedInClient(customerEmail)
    const { error } = await client.rpc(fn, args)
    expect(error, `${fn} should be refused`).toBeTruthy()
    expect(error.message).toContain('not_admin')
  })

  /** FR-6.5: the Manager cannot edit the menu. The mirror of FR-7.6. */
  it.skipIf(!staffConfigured()).each(calls)('the MANAGER cannot call %s', async (fn, args) => {
    const { client } = await managerClient()
    const { error } = await client.rpc(fn, args)
    expect(error, `FR-6.5: the manager must not reach ${fn}`).toBeTruthy()
    expect(error.message).toContain('not_admin')
  })
})

describe.skipIf(!staffConfigured())('the Admin can run the menu (FR-7.2)', () => {
  it('sees items customers cannot, including inactive ones', async () => {
    const { client } = await adminClient()
    const id = await makeItem(client)
    const { data, error } = await client.rpc('admin_menu_items')
    expect(error).toBeNull()
    const mine = data.find((i) => i.id === id)
    expect(mine, 'an inactive item must still be editable').toBeTruthy()
    expect(mine.is_active).toBe(false)
  })

  it('creates, edits and deletes an item', async () => {
    const { client } = await adminClient()
    const id = await makeItem(client)

    const { error: editError } = await client.rpc('admin_save_menu_item', {
      p_id: id,
      p_name: 'ZZ Renamed',
      p_description: 'edited',
      p_image_url: null,
      p_category: 'Testing',
      p_badge: null,
      p_sort_order: 9999,
      p_is_active: false,
      p_is_sold_out: true,
    })
    expect(editError).toBeNull()

    const after = (await client.rpc('admin_menu_items')).data.find((i) => i.id === id)
    expect(after.name).toBe('ZZ Renamed')
    expect(after.category).toBe('Testing')
    expect(after.is_sold_out).toBe(true)

    const { error: delError } = await client.rpc('admin_delete_menu_item', { p_id: id })
    expect(delError).toBeNull()
    // Forget only THIS item. `scratch.length = 0` looked equivalent and was
    // not: it discarded every other test's pending cleanup too, so the first
    // scratch item of the run leaked into the real menu every time.
    const mine = scratch.findIndex((s) => s.id === id)
    if (mine >= 0) scratch.splice(mine, 1)

    const gone = (await client.rpc('admin_menu_items')).data.find((i) => i.id === id)
    expect(gone).toBeUndefined()
  })

  it('adds, edits and removes a size', async () => {
    const { client } = await adminClient()
    const itemId = await makeItem(client)

    const { data: sizeId, error } = await client.rpc('admin_save_menu_size', {
      p_id: null,
      p_menu_item_id: itemId,
      p_size: 'Medium',
      p_price: 500,
      p_serves: '2',
      p_sort_order: 1,
    })
    expect(error).toBeNull()

    await client.rpc('admin_save_menu_size', {
      p_id: sizeId,
      p_menu_item_id: itemId,
      p_size: 'Medium',
      p_price: 650,
      p_serves: '2-3',
      p_sort_order: 1,
    })

    const item = (await client.rpc('admin_menu_items')).data.find((i) => i.id === itemId)
    expect(item.sizes).toHaveLength(1)
    expect(Number(item.sizes[0].price)).toBe(650)
    expect(item.sizes[0].serves).toBe('2-3')

    const { error: delError } = await client.rpc('admin_delete_menu_size', { p_id: sizeId })
    expect(delError).toBeNull()
  })

  it('refuses two sizes with the same name on one item', async () => {
    const { client } = await adminClient()
    const itemId = await makeItem(client)
    await client.rpc('admin_save_menu_size', {
      p_id: null,
      p_menu_item_id: itemId,
      p_size: 'Large',
      p_price: 900,
      p_serves: null,
      p_sort_order: 0,
    })
    const { error } = await client.rpc('admin_save_menu_size', {
      p_id: null,
      p_menu_item_id: itemId,
      p_size: 'Large',
      p_price: 950,
      p_serves: null,
      p_sort_order: 0,
    })
    expect(error?.message).toContain('size_already_exists')
  })

  /**
   * order_items references both tables ON DELETE RESTRICT so that order
   * history cannot be rewritten by tidying the menu. The function checks it up
   * front and says so, rather than letting a constraint name reach the Admin.
   */
  it('refuses to delete an item that has been ordered', async () => {
    const { client } = await adminClient()
    const all = (await client.rpc('admin_menu_items')).data
    const ordered = all.find((i) => Number(i.order_count) > 0)
    expect(ordered, 'no ordered item to test with — place an order first').toBeTruthy()

    const { error } = await client.rpc('admin_delete_menu_item', { p_id: ordered.id })
    expect(error?.message).toContain('item_has_orders')

    const still = (await client.rpc('admin_menu_items')).data.find((i) => i.id === ordered.id)
    expect(still, 'the item was deleted despite having orders').toBeTruthy()
  })

  /**
   * out_of_stock belongs to the inventory engine (Part 3). There is no
   * parameter for it, so saving an item must leave it exactly as it was.
   */
  it('cannot set the engine-owned out_of_stock flag', async () => {
    const { client } = await adminClient()
    const all = (await client.rpc('admin_menu_items')).data
    const target = all[0]
    const before = target.out_of_stock

    await client.rpc('admin_save_menu_item', {
      p_id: target.id,
      p_name: target.name,
      p_description: target.description,
      p_image_url: target.image_url,
      p_category: target.category,
      p_badge: target.badge,
      p_sort_order: target.sort_order,
      p_is_active: target.is_active,
      p_is_sold_out: target.is_sold_out,
    })

    const after = (await client.rpc('admin_menu_items')).data.find((i) => i.id === target.id)
    expect(after.out_of_stock, 'the Admin moved a flag the engine owns').toBe(before)
  })
})

describe.skipIf(!staffConfigured())('what the database refuses', () => {
  async function save(overrides) {
    const { client } = await adminClient()
    return client.rpc('admin_save_menu_item', {
      p_id: null,
      p_name: 'ZZ Bad',
      p_description: null,
      p_image_url: null,
      p_category: null,
      p_badge: null,
      p_sort_order: 9999,
      p_is_active: false,
      p_is_sold_out: false,
      ...overrides,
    })
  }

  it('an item with no name', async () => {
    expect((await save({ p_name: '   ' })).error?.message).toContain('name_required')
  })

  it(`a name past ${MAX_ITEM_NAME} characters`, async () => {
    const { error } = await save({ p_name: 'z'.repeat(MAX_ITEM_NAME + 1) })
    expect(error?.message, 'the JS and SQL name limits have drifted').toContain('name_too_long')
  })

  it(`a name of exactly ${MAX_ITEM_NAME} is accepted`, async () => {
    const { data, error } = await save({ p_name: `ZZ${'z'.repeat(MAX_ITEM_NAME - 2)}` })
    expect(error).toBeNull()
    const { client } = await adminClient()
    scratch.push({ client, id: data })
  })

  it(`a description past ${MAX_ITEM_DESCRIPTION} characters`, async () => {
    const { error } = await save({ p_description: 'z'.repeat(MAX_ITEM_DESCRIPTION + 1) })
    expect(error?.message).toContain('description_too_long')
  })

  it(`a category past ${MAX_SHORT_TEXT} characters`, async () => {
    const { error } = await save({ p_category: 'z'.repeat(MAX_SHORT_TEXT + 1) })
    expect(error?.message).toContain('category_too_long')
  })

  it('a negative price', async () => {
    const { client } = await adminClient()
    const itemId = await makeItem(client)
    const { error } = await client.rpc('admin_save_menu_size', {
      p_id: null,
      p_menu_item_id: itemId,
      p_size: 'M',
      p_price: -1,
      p_serves: null,
      p_sort_order: 0,
    })
    expect(error?.message).toContain('invalid_price')
  })

  it(`a price past ${MAX_ITEM_PRICE}`, async () => {
    const { client } = await adminClient()
    const itemId = await makeItem(client)
    const { error } = await client.rpc('admin_save_menu_size', {
      p_id: null,
      p_menu_item_id: itemId,
      p_size: 'M',
      p_price: MAX_ITEM_PRICE + 1,
      p_serves: null,
      p_sort_order: 0,
    })
    expect(error?.message, 'the JS and SQL price caps have drifted').toContain('price_too_large')
  })

  it('a size on an item that does not exist', async () => {
    const { client } = await adminClient()
    const { error } = await client.rpc('admin_save_menu_size', {
      p_id: null,
      p_menu_item_id: '00000000-0000-4000-8000-000000000000',
      p_size: 'M',
      p_price: 100,
      p_serves: null,
      p_sort_order: 0,
    })
    expect(error?.message).toContain('item_not_found')
  })
})
