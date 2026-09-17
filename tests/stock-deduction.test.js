import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { COPY } from '../src/content/copy.js'
import { anonClient, signedInClient, placeOrderOrThrow, placeOrder } from './helpers/supabase.js'

// Part 3, task 4: stock comes out when an order is placed, in the same
// transaction, or the order does not happen.
//
// The arithmetic — that mozzarella drops by exactly 150, that a failed order
// leaves nothing deducted — is in supabase/verify_stock.sql, because it needs
// to read the ingredients table and this suite runs on the anon key.
//
// What is here is the half that matters more for safety. deduct_order_stock()
// is SECURITY DEFINER over a table nobody can touch; if it were callable, any
// visitor could empty the shop by calling it in a loop against their own order
// id, and restore_order_stock() would let them invent inventory that does not
// exist. Those two are the most dangerous functions in the project.

const anon = anonClient()

describe('the stock functions cannot be called from the browser', () => {
  const cases = [
    ['deduct_order_stock', 'drain the shop to zero'],
    ['restore_order_stock', 'invent inventory that was never bought'],
  ]

  it('a guest cannot raise low-stock alerts', async () => {
    // note_stock_level() writes into stock_alerts, which is what the Manager
    // will be looking at in Part 4. Left callable, anyone could bury a real
    // shortage under a thousand invented ones.
    const { error } = await anon.rpc('note_stock_level', {
      p_ingredient_id: randomUUID(),
      p_before: 100,
      p_after: 0,
    })

    expect(error?.message).toMatch(/permission denied/i)
  })

  it('a signed-in customer cannot either', async () => {
    const { client } = await signedInClient(process.env.TEST_USER_A_EMAIL)
    const { error } = await client.rpc('note_stock_level', {
      p_ingredient_id: randomUUID(),
      p_before: 100,
      p_after: 0,
    })

    expect(error?.message).toMatch(/permission denied/i)
  })

  it('and cannot read the alerts that do get raised', async () => {
    // Stock levels are the shop's business. An alert row names an ingredient
    // and the exact level it fell to.
    const { error, data } = await anon.from('stock_alerts').select('*')

    expect(error !== null || (data ?? []).length === 0).toBe(true)
  })

  it.each(cases)('a guest cannot call %s — it would let them %s', async (fn) => {
    const { error } = await anon.rpc(fn, { p_order_id: randomUUID() })

    expect(error?.message).toMatch(/permission denied/i)
  })

  it.each(cases)('a signed-in customer cannot call %s either', async (fn) => {
    const { client } = await signedInClient(process.env.TEST_USER_A_EMAIL)
    const { error } = await client.rpc(fn, { p_order_id: randomUUID() })

    expect(error?.message).toMatch(/permission denied/i)
  })

  it('cannot be called against an order the caller genuinely owns', async () => {
    // The sharpest version: a real order, really theirs. Calling deduct twice
    // on your own order would charge the shop's stock twice for one pizza.
    const own = await placeOrderOrThrow(anon, { name: 'Stock Probe' })
    const { error } = await anon.rpc('deduct_order_stock', { p_order_id: own.order.id })

    expect(error?.message).toMatch(/permission denied/i)
  })
})

describe('ordering still works with the deduction in the path', () => {
  it('places an order end to end', async () => {
    // If the deduction raised, or the coverage guard misfired, this is where it
    // would show up — place_order() now fails whenever the stock move does.
    const order = await placeOrderOrThrow(anon, { name: 'Stock Probe' })

    expect(order.order.status).toBe('placed')
    expect(order.items.length).toBeGreaterThan(0)
    expect(Number(order.order.total)).toBeGreaterThan(0)
  })

  it('places an order with an extra topping end to end', async () => {
    // Extras are deducted from the same shelves, so this is the path where a
    // double-counting bug or a missing topping_recipes row would surface.
    const { data: menu } = await anon
      .from('menu_items')
      .select('id, menu_item_sizes(id), menu_item_toppings(toppings(id))')
      .eq('name', 'Chicken Tikka')
      .single()

    const order = await placeOrderOrThrow(anon, { name: 'Stock Probe' }, [
      {
        size_id: menu.menu_item_sizes[0].id,
        quantity: 1,
        topping_ids: [menu.menu_item_toppings[0].toppings.id],
      },
    ])

    expect(order.order.status).toBe('placed')
  })

  it('still refuses a sold-out item before it gets anywhere near stock', async () => {
    // The pre-existing guard must keep firing first: an inactive or sold-out
    // item should be rejected as unavailable, not as out of stock.
    const { error } = await placeOrder(anon, { name: 'Stock Probe' }, [
      { size_id: randomUUID(), quantity: 1 },
    ])

    expect(error?.message).toBe('item_unavailable')
  })
})

describe('the order a customer reads back carries no engine bookkeeping', () => {
  it('does not expose stock_deducted', async () => {
    // The engine records on each order whether its ingredients were taken, so
    // that a refund can never fire twice. That is internal — and on the way out
    // of place_order() it is also STALE, because the order row is captured
    // before the deduction runs. A field that says "false" about something that
    // just happened is worse than no field at all.
    const placed = await placeOrderOrThrow(anon, { name: 'Stock Probe' })

    expect(placed.order).not.toHaveProperty('stock_deducted')

    const { data } = await anon.rpc('get_order_by_token', {
      p_access_token: placed.access_token,
    })

    expect(data.order).not.toHaveProperty('stock_deducted')
  })

  it('still carries everything the tracking page needs', async () => {
    // The strip must take one field, not shave off something the UI renders.
    const placed = await placeOrderOrThrow(anon, { name: 'Stock Probe' })

    for (const field of [
      'order_number',
      'status',
      'fulfillment_type',
      'customer_name',
      'customer_phone',
      'subtotal',
      'delivery_fee',
      'total',
      'created_at',
    ]) {
      expect(placed.order, `missing ${field}`).toHaveProperty(field)
    }
  })

  it('never hands back the access token on a later read', async () => {
    const placed = await placeOrderOrThrow(anon, { name: 'Stock Probe' })
    const { data } = await anon.rpc('get_order_by_token', {
      p_access_token: placed.access_token,
    })

    expect(data.order).not.toHaveProperty('access_token')
  })
})

describe('the customer is told what happened', () => {
  it('has a message for every error the deduction can raise', () => {
    // Without a mapping, a shortage would surface to the customer as the raw
    // string "out_of_stock".
    for (const code of ['out_of_stock', 'recipe_missing']) {
      expect(COPY.checkout.orderErrors[code], `no message for "${code}"`).toBeTruthy()
    }
  })

  it('does not name the ingredient that ran out', () => {
    // The message points at the menu, not at the recipe. Naming the shortage
    // would hand out the shop's costings a word at a time.
    const message = COPY.checkout.orderErrors.out_of_stock.toLowerCase()

    for (const secret of ['mozzarella', 'cheese', 'dough', 'chicken', 'gram', 'kg']) {
      expect(message, `the shortage message mentions "${secret}"`).not.toContain(secret)
    }
  })
})
