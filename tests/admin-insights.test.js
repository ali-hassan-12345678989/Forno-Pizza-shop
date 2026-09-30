import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MAX_ADMIN_DAYS } from '../src/config/adminInsights.js'
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
 * Everything supabase/admin_insights.sql added.
 *
 * THESE WRITE TO LIVE DATA — a real ingredient's cost, a real pizza's recipe —
 * because there is no other way to prove the guards hold. Every test that
 * changes something records what it found first and puts it back in an
 * afterAll, and the recipe tests deliberately work on a line they add
 * themselves rather than one the kitchen depends on.
 *
 * The claim running through all of it: an unpriced ingredient is UNKNOWN, never
 * free. A report that quietly treated it as zero would be at its most confident
 * exactly when it knew least, and every assertion about null below is there to
 * stop that.
 */

const customerEmail = process.env.TEST_USER_A_EMAIL

let admin
let manager

/** What we found before touching anything, so it can be put back. */
const restore = { costs: new Map(), recipeLines: [] }

const shopToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date())

/** An ingredient with stock, so a valuation has something to multiply. */
const someIngredient = async () => {
  const { data } = await admin.rpc('admin_inventory_value')
  return data.find((r) => Number(r.stock_quantity) > 0) ?? data[0]
}

beforeAll(async () => {
  if (!staffConfigured()) return
  admin = (await adminClient()).client
  manager = (await managerClient()).client
}, 30_000)

afterAll(async () => {
  if (!admin) return

  for (const [id, cost] of restore.costs) {
    await admin.rpc('admin_set_ingredient_cost', { p_ingredient_id: id, p_cost: cost })
  }
  for (const line of restore.recipeLines) {
    await admin.rpc('admin_delete_recipe_line', {
      p_size_id: line.sizeId,
      p_ingredient_id: line.ingredientId,
    })
  }
  await releasePlacedOrders()
}, 30_000)

describe.runIf(staffConfigured())('pricing an ingredient', () => {
  it('stores a cost and reports it back', async () => {
    const row = await someIngredient()
    restore.costs.set(row.ingredient_id, row.cost_per_unit)

    const { data, error } = await admin.rpc('admin_set_ingredient_cost', {
      p_ingredient_id: row.ingredient_id,
      p_cost: 1.25,
    })

    expect(error).toBeNull()
    expect(Number(data.cost)).toBe(1.25)
  })

  it('values the shelf at cost times quantity', async () => {
    const row = await someIngredient()
    restore.costs.set(row.ingredient_id, row.cost_per_unit)

    await admin.rpc('admin_set_ingredient_cost', { p_ingredient_id: row.ingredient_id, p_cost: 2 })

    const { data } = await admin.rpc('admin_inventory_value')
    const priced = data.find((r) => r.ingredient_id === row.ingredient_id)

    expect(Number(priced.value)).toBeCloseTo(Number(priced.stock_quantity) * 2, 2)
  })

  it('reports an unpriced shelf as unknown, NOT as worth nothing', async () => {
    // The single most important assertion in this file. A null coerced to zero
    // here would make an unpriced kitchen look like a free one.
    const row = await someIngredient()
    restore.costs.set(row.ingredient_id, row.cost_per_unit)

    await admin.rpc('admin_set_ingredient_cost', {
      p_ingredient_id: row.ingredient_id,
      p_cost: null,
    })

    const { data } = await admin.rpc('admin_inventory_value')
    const cleared = data.find((r) => r.ingredient_id === row.ingredient_id)

    expect(cleared.cost_per_unit).toBeNull()
    expect(cleared.value).toBeNull()
  })

  it('refuses a negative price', async () => {
    const row = await someIngredient()
    const { error } = await admin.rpc('admin_set_ingredient_cost', {
      p_ingredient_id: row.ingredient_id,
      p_cost: -1,
    })
    expect(error?.message).toBe('invalid_cost')
  })

  it('refuses the Manager, whose job this is not', async () => {
    const row = await someIngredient()
    const { error } = await manager.rpc('admin_set_ingredient_cost', {
      p_ingredient_id: row.ingredient_id,
      p_cost: 1,
    })
    expect(error?.message).toBe('not_admin')
  })

  it('is unreachable by a signed-out visitor', async () => {
    const { error } = await anonClient().rpc('admin_inventory_value')
    expect(error).not.toBeNull()
  })
})

describe.runIf(staffConfigured())('what a pizza costs', () => {
  it('refuses to cost a size whose recipe has an unpriced ingredient', async () => {
    /* The cost of the four ingredients that happen to have a price is not the
       cost of the pizza, and showing it as one is how a menu decision gets made
       on a flattering number. */
    const { data, error } = await admin.rpc('admin_menu_costs')
    expect(error).toBeNull()

    for (const row of data) {
      if (Number(row.missing_costs) > 0) {
        expect(row.food_cost).toBeNull()
        expect(row.margin).toBeNull()
        expect(row.margin_percent).toBeNull()
      }
    }
  })

  it('costs a size once every ingredient behind it has a price', async () => {
    const { data: sizes } = await admin.rpc('admin_menu_costs')
    const target = sizes.find((s) => Number(row_lines(s)) > 0)
    expect(target).toBeTruthy()

    const { data: recipe } = await admin.rpc('admin_recipe_for_size', { p_size_id: target.size_id })

    for (const line of recipe) {
      restore.costs.set(line.ingredient_id, line.cost_per_unit)
      await admin.rpc('admin_set_ingredient_cost', {
        p_ingredient_id: line.ingredient_id,
        p_cost: 0.5,
      })
    }

    const { data: after } = await admin.rpc('admin_menu_costs')
    const costed = after.find((s) => s.size_id === target.size_id)

    const expected = recipe.reduce((sum, l) => sum + Number(l.quantity) * 0.5, 0)
    expect(Number(costed.food_cost)).toBeCloseTo(expected, 1)
    expect(Number(costed.margin)).toBeCloseTo(Number(costed.price) - expected, 1)
  })

  it('never claims a margin percentage on a free item', async () => {
    // A percentage of zero is undefined, not 100%.
    const { data } = await admin.rpc('admin_menu_costs')
    for (const row of data) {
      if (Number(row.price) === 0) expect(row.margin_percent).toBeNull()
    }
  })
})

/** How many ingredients a size's recipe has, from an admin_menu_costs row. */
function row_lines(row) {
  return row.ingredients_in_recipe
}

describe.runIf(staffConfigured())('cost of goods', () => {
  it('reports its own coverage rather than presenting a partial figure as whole', async () => {
    const today = shopToday()
    const { data, error } = await admin.rpc('admin_cogs', { p_from: today, p_to: today })

    expect(error).toBeNull()
    const row = data[0]
    expect(Number(row.total_ingredients)).toBeGreaterThan(0)
    expect(Number(row.priced_ingredients)).toBeLessThanOrEqual(Number(row.total_ingredients))
  })

  it('adds the counted leak to the recipe figure', async () => {
    const today = shopToday()
    const before = (await admin.rpc('admin_cogs', { p_from: today, p_to: today })).data[0]

    expect(Number(before.actual_cost)).toBeCloseTo(
      Number(before.theoretical_cost) + Number(before.variance_cost),
      2,
    )
  })

  it('refuses a reversed window', async () => {
    const { error } = await admin.rpc('admin_cogs', {
      p_from: '2026-09-30',
      p_to: '2026-09-01',
    })
    expect(error?.message).toBe('invalid_range')
  })

  it('refuses a window longer than the browser is allowed to ask for', async () => {
    const { error } = await admin.rpc('admin_cogs', { p_from: '2020-01-01', p_to: '2026-12-31' })
    expect(error?.message).toBe('range_too_long')
  })

  it('agrees with config about how long that is', async () => {
    const from = '2026-01-01'
    const justInside = new Date(Date.parse(`${from}T00:00:00Z`) + MAX_ADMIN_DAYS * 86400000)
      .toISOString()
      .slice(0, 10)
    const { error } = await admin.rpc('admin_cogs', { p_from: from, p_to: justInside })
    expect(error).toBeNull()
  })

  it('is unreachable by a signed-out visitor', async () => {
    const today = shopToday()
    const { error } = await anonClient().rpc('admin_cogs', { p_from: today, p_to: today })
    expect(error).not.toBeNull()
  })
})

describe.runIf(staffConfigured())('the product mix and the clock', () => {
  it('flags an item whose ingredients are not all priced', async () => {
    const { data, error } = await admin.rpc('admin_product_mix', { p_days: 30 })
    expect(error).toBeNull()

    for (const row of data) {
      if (!row.costs_known) {
        expect(row.food_cost).toBeNull()
        expect(row.margin).toBeNull()
      }
    }
  })

  it('times the stages this kitchen actually records', async () => {
    const { data, error } = await admin.rpc('admin_fulfillment_times', { p_days: MAX_ADMIN_DAYS })
    expect(error).toBeNull()

    // Four spans at most — three stages plus the whole journey. Never a
    // made-up fourth station.
    expect(data.length).toBeLessThanOrEqual(4)
    for (const row of data) {
      expect(Number(row.median_seconds)).toBeGreaterThanOrEqual(0)
      expect(Number(row.orders_timed)).toBeGreaterThan(0)
    }
  })

  it('refuses a nonsense window on both', async () => {
    expect((await admin.rpc('admin_product_mix', { p_days: 0 })).error?.message).toBe(
      'invalid_range',
    )
    expect((await admin.rpc('admin_fulfillment_times', { p_days: -1 })).error?.message).toBe(
      'invalid_range',
    )
  })
})

describe.runIf(staffConfigured())('weekly targets', () => {
  it('returns all seven days, target or not', async () => {
    // A missing row means "no target set". An absent day would just look like
    // a day the shop does not open.
    const { data, error } = await admin.rpc('admin_sales_targets')
    expect(error).toBeNull()
    expect(data.map((r) => Number(r.day_of_week)).sort()).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('stores a target and clears it again', async () => {
    await admin.rpc('admin_set_sales_target', { p_day_of_week: 3, p_target: 12345 })
    let rows = (await admin.rpc('admin_sales_targets')).data
    expect(Number(rows.find((r) => Number(r.day_of_week) === 3).target_revenue)).toBe(12345)

    // Null clears it. A figure typed by mistake has to be removable, not merely
    // replaceable by another guess.
    await admin.rpc('admin_set_sales_target', { p_day_of_week: 3, p_target: null })
    rows = (await admin.rpc('admin_sales_targets')).data
    expect(rows.find((r) => Number(r.day_of_week) === 3).target_revenue).toBeNull()
  })

  it('refuses a day that is not a day', async () => {
    const { error } = await admin.rpc('admin_set_sales_target', { p_day_of_week: 9, p_target: 1 })
    expect(error?.message).toBe('invalid_day')
  })

  it('lets the Manager read targets but not set them', async () => {
    expect((await manager.rpc('admin_sales_targets')).error).toBeNull()
    expect(
      (await manager.rpc('admin_set_sales_target', { p_day_of_week: 1, p_target: 1 })).error
        ?.message,
    ).toBe('not_admin')
  })

  it('never exposes the targets table directly', async () => {
    expect((await anonClient().from('sales_targets').select('*')).error).not.toBeNull()
    expect((await admin.from('sales_targets').select('*')).error).not.toBeNull()
  })
})

describe.runIf(staffConfigured())('editing a recipe', () => {
  /** A size with a recipe, and an ingredient that is not on it yet. */
  const pickTarget = async () => {
    const { data: sizes } = await admin.rpc('admin_menu_costs')
    const size = sizes.find((s) => Number(s.ingredients_in_recipe) > 1)
    const { data: recipe } = await admin.rpc('admin_recipe_for_size', { p_size_id: size.size_id })
    const on = new Set(recipe.map((r) => r.ingredient_id))
    const { data: all } = await admin.rpc('admin_inventory_value')
    const spare = all.find((i) => !on.has(i.ingredient_id))
    return { size, recipe, spare }
  }

  it('adds an ingredient and takes it off again', async () => {
    const { size, spare } = await pickTarget()
    restore.recipeLines.push({ sizeId: size.size_id, ingredientId: spare.ingredient_id })

    const added = await admin.rpc('admin_save_recipe_line', {
      p_size_id: size.size_id,
      p_ingredient_id: spare.ingredient_id,
      p_quantity: 7,
    })
    expect(added.error).toBeNull()

    const { data: after } = await admin.rpc('admin_recipe_for_size', { p_size_id: size.size_id })
    expect(Number(after.find((r) => r.ingredient_id === spare.ingredient_id).quantity)).toBe(7)

    const removed = await admin.rpc('admin_delete_recipe_line', {
      p_size_id: size.size_id,
      p_ingredient_id: spare.ingredient_id,
    })
    expect(removed.error).toBeNull()
  })

  it('changes a quantity rather than adding the ingredient twice', async () => {
    const { size, spare } = await pickTarget()
    restore.recipeLines.push({ sizeId: size.size_id, ingredientId: spare.ingredient_id })

    await admin.rpc('admin_save_recipe_line', {
      p_size_id: size.size_id,
      p_ingredient_id: spare.ingredient_id,
      p_quantity: 5,
    })
    await admin.rpc('admin_save_recipe_line', {
      p_size_id: size.size_id,
      p_ingredient_id: spare.ingredient_id,
      p_quantity: 9,
    })

    const { data } = await admin.rpc('admin_recipe_for_size', { p_size_id: size.size_id })
    const lines = data.filter((r) => r.ingredient_id === spare.ingredient_id)
    expect(lines).toHaveLength(1)
    expect(Number(lines[0].quantity)).toBe(9)
  })

  it('refuses a quantity of zero, which is not a recipe line', async () => {
    const { size, spare } = await pickTarget()
    const { error } = await admin.rpc('admin_save_recipe_line', {
      p_size_id: size.size_id,
      p_ingredient_id: spare.ingredient_id,
      p_quantity: 0,
    })
    expect(error?.message).toBe('invalid_quantity')
  })

  it('REFUSES TO EMPTY the recipe of a size that is live on the menu', async () => {
    /* The guard that matters. A size with no recipe makes place_order() raise
       recipe_missing, so the pizza would stay listed, stay addable to a cart,
       and fail at the last step of checkout — discovered by a customer at 8pm.
       Proven by emptying a live recipe down to its last line and checking the
       database refuses to take that one. */
    const { data: sizes } = await admin.rpc('admin_menu_costs')
    const live = sizes.find((s) => s.is_active && Number(s.ingredients_in_recipe) >= 1)
    const { data: recipe } = await admin.rpc('admin_recipe_for_size', { p_size_id: live.size_id })

    // Remove all but the last, remembering each so afterAll can put them back.
    const removed = []
    for (const line of recipe.slice(0, -1)) {
      const { error } = await admin.rpc('admin_delete_recipe_line', {
        p_size_id: live.size_id,
        p_ingredient_id: line.ingredient_id,
      })
      if (!error) removed.push(line)
    }

    const last = recipe[recipe.length - 1]
    const { error } = await admin.rpc('admin_delete_recipe_line', {
      p_size_id: live.size_id,
      p_ingredient_id: last.ingredient_id,
    })

    // Put the recipe back BEFORE asserting, so a failure here does not leave a
    // live pizza unorderable.
    for (const line of removed) {
      await admin.rpc('admin_save_recipe_line', {
        p_size_id: live.size_id,
        p_ingredient_id: line.ingredient_id,
        p_quantity: Number(line.quantity),
      })
    }

    expect(error?.message).toBe('would_break_ordering')
  })

  it('refuses the Manager', async () => {
    const { size, spare } = await pickTarget()
    const { error } = await manager.rpc('admin_save_recipe_line', {
      p_size_id: size.size_id,
      p_ingredient_id: spare.ingredient_id,
      p_quantity: 1,
    })
    expect(error?.message).toBe('not_admin')
  })
})

describe.runIf(staffConfigured())('finding an order', () => {
  it('finds it by the phone number the customer reads out', async () => {
    const customer = (await signedInClient(customerEmail)).client
    const placed = await placeOrderOrThrow(customer)
    const phone = placed.order.customer_phone

    const { data, error } = await admin.rpc('admin_orders', { p_limit: 100, p_search: phone })
    expect(error).toBeNull()
    expect(data.some((r) => r.order_number === placed.order.order_number)).toBe(true)

    await customer.rpc('cancel_order', { p_access_token: placed.access_token })
  })

  it('finds it however the number is spaced', async () => {
    // A customer reading their number out does not use the shop's spacing.
    const customer = (await signedInClient(customerEmail)).client
    const placed = await placeOrderOrThrow(customer)
    const spaced = placed.order.customer_phone.replace(/(\d{4})(\d+)/, '$1 $2')

    const { data } = await admin.rpc('admin_orders', { p_limit: 100, p_search: spaced })
    expect(data.some((r) => r.order_number === placed.order.order_number)).toBe(true)

    await customer.rpc('cancel_order', { p_access_token: placed.access_token })
  })

  it('STILL does not hand the phone number back', async () => {
    /* The whole point of matching it server-side. The list carries no contact
       details, so a screenshot of this screen leaks none — searching by phone
       must not have quietly undone that. */
    const { data } = await admin.rpc('admin_orders', { p_limit: 20, p_search: '03' })
    for (const row of data ?? []) {
      expect(row).not.toHaveProperty('customer_phone')
      expect(row).not.toHaveProperty('delivery_address')
    }
  })

  it('finds it by order number and by name', async () => {
    const customer = (await signedInClient(customerEmail)).client
    const placed = await placeOrderOrThrow(customer)

    const byNumber = await admin.rpc('admin_orders', {
      p_limit: 100,
      p_search: placed.order.order_number,
    })
    expect(byNumber.data.some((r) => r.order_number === placed.order.order_number)).toBe(true)

    const byName = await admin.rpc('admin_orders', {
      p_limit: 100,
      p_search: placed.order.customer_name,
    })
    expect(byName.data.some((r) => r.order_number === placed.order.order_number)).toBe(true)

    await customer.rpc('cancel_order', { p_access_token: placed.access_token })
  })

  it('treats a blank search as no search', async () => {
    // Otherwise an empty box matches every order whose phone contains the empty
    // string — the same answer as no search, arrived at the expensive way.
    const blank = await admin.rpc('admin_orders', { p_limit: 20, p_search: '   ' })
    const none = await admin.rpc('admin_orders', { p_limit: 20, p_search: null })
    expect(blank.data.length).toBe(none.data.length)
  })

  it('still answers the old one-argument call', async () => {
    // Nothing that calls it today needs to change.
    const { error } = await admin.rpc('admin_orders', { p_limit: 10 })
    expect(error).toBeNull()
  })
})
