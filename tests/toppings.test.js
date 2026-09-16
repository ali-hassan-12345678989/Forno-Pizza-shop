import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  anonClient,
  FIXTURES,
  placeOrder,
  placeOrderOrThrow,
  toppingsFor,
  itemWithoutToppings,
  isWriteDenied,
} from './helpers/supabase.js'

// Extras are the newest way for a browser to argue about money: the customer
// picks them, so the request has to carry something. It carries ids and nothing
// else, and place_order() looks up what they cost. These tests hold that line.

const anon = anonClient()
const pickup = { fulfillmentType: 'pickup', address: null }

let extras
let mediumPrice

beforeAll(async () => {
  extras = await toppingsFor(anon, FIXTURES.menuItemId)

  const { data } = await anon
    .from('menu_item_sizes')
    .select('price')
    .eq('id', FIXTURES.sizeMediumId)
    .single()

  mediumPrice = Number(data.price)
})

describe('the topping catalogue is public and read-only', () => {
  it('a guest can read the toppings', async () => {
    const { data, error } = await anon.from('toppings').select('*')

    expect(error).toBeNull()
    expect(data.length).toBeGreaterThan(0)
  })

  it('a pizza offers extras', async () => {
    expect(extras.length).toBeGreaterThan(0)
  })

  it('some extras are genuinely free, and that is not a null', async () => {
    // The UI shows "Free" rather than "+ Rs. 0", so 0 has to be a real price.
    const free = extras.filter((t) => t.price === 0)

    expect(free.length).toBeGreaterThan(0)
    for (const t of free) expect(Number.isFinite(t.price)).toBe(true)
  })

  it('a guest cannot reprice a topping', async () => {
    const { error, data } = await anon
      .from('toppings')
      .update({ price: 0 })
      .eq('id', extras[0].id)
      .select()

    expect(isWriteDenied(error) || (data ?? []).length === 0).toBe(true)
  })

  it('a guest cannot invent a topping', async () => {
    const { error } = await anon.from('toppings').insert({ name: 'Free Everything', price: 0 })

    expect(error).not.toBeNull()
  })

  it('a guest cannot attach a topping to an item that does not offer it', async () => {
    const burger = await itemWithoutToppings(anon)
    const { error } = await anon
      .from('menu_item_toppings')
      .insert({ menu_item_id: burger.id, topping_id: extras[0].id })

    expect(error).not.toBeNull()
  })
})

describe('extras are priced by the database, not the browser', () => {
  it('a paid extra is added to the line at the catalogue price', async () => {
    const paid = extras.find((t) => t.price > 0)

    const order = await placeOrderOrThrow(anon, pickup, [
      { size_id: FIXTURES.sizeMediumId, quantity: 1, topping_ids: [paid.id] },
    ])

    expect(Number(order.items[0].unit_price)).toBe(mediumPrice + paid.price)
    expect(Number(order.order.total)).toBe(mediumPrice + paid.price)
  })

  it('a price smuggled alongside the topping id is ignored', async () => {
    const paid = extras.find((t) => t.price > 0)

    const order = await placeOrderOrThrow(anon, pickup, [
      {
        size_id: FIXTURES.sizeMediumId,
        quantity: 1,
        topping_ids: [paid.id],
        topping_price: 0,
        unit_price: 1,
        price: 1,
      },
    ])

    expect(Number(order.order.total)).toBe(mediumPrice + paid.price)
  })

  it('a free extra adds nothing', async () => {
    const free = extras.find((t) => t.price === 0)

    const order = await placeOrderOrThrow(anon, pickup, [
      { size_id: FIXTURES.sizeMediumId, quantity: 1, topping_ids: [free.id] },
    ])

    expect(Number(order.order.total)).toBe(mediumPrice)
  })

  it('several extras all count', async () => {
    const chosen = extras.slice(0, 3)
    const expected = chosen.reduce((sum, t) => sum + t.price, mediumPrice)

    const order = await placeOrderOrThrow(anon, pickup, [
      { size_id: FIXTURES.sizeMediumId, quantity: 1, topping_ids: chosen.map((t) => t.id) },
    ])

    expect(Number(order.items[0].unit_price)).toBe(expected)
  })

  it('extras are multiplied by quantity, not charged once', async () => {
    const paid = extras.find((t) => t.price > 0)

    const order = await placeOrderOrThrow(anon, pickup, [
      { size_id: FIXTURES.sizeMediumId, quantity: 3, topping_ids: [paid.id] },
    ])

    expect(Number(order.items[0].line_total)).toBe((mediumPrice + paid.price) * 3)
  })

  it('the order total still equals the sum of its own lines', async () => {
    const paid = extras.find((t) => t.price > 0)

    const order = await placeOrderOrThrow(anon, {}, [
      { size_id: FIXTURES.sizeMediumId, quantity: 2, topping_ids: [paid.id] },
      { size_id: FIXTURES.sizeLargeId, quantity: 1, topping_ids: [] },
    ])

    const lines = order.items.reduce((sum, i) => sum + Number(i.line_total), 0)

    expect(Number(order.order.subtotal)).toBe(lines)
    expect(Number(order.order.total)).toBe(lines + Number(order.order.delivery_fee))
  })
})

describe('extras that were never on offer are refused', () => {
  it('an unknown topping id is rejected', async () => {
    const { error } = await placeOrder(anon, pickup, [
      { size_id: FIXTURES.sizeMediumId, quantity: 1, topping_ids: [randomUUID()] },
    ])

    expect(error?.message).toBe('topping_unavailable')
  })

  it('a pizza topping cannot be put on a burger', async () => {
    // The join table is the authority, not the request.
    const burger = await itemWithoutToppings(anon)
    const sizeId = burger.menu_item_sizes[0].id

    const { error } = await placeOrder(anon, pickup, [
      { size_id: sizeId, quantity: 1, topping_ids: [extras[0].id] },
    ])

    expect(error?.message).toBe('topping_unavailable')
  })

  it('more extras than any pizza offers is refused', async () => {
    const { error } = await placeOrder(anon, pickup, [
      {
        size_id: FIXTURES.sizeMediumId,
        quantity: 1,
        topping_ids: Array.from({ length: 11 }, randomUUID),
      },
    ])

    expect(error?.message).toBe('too_many_toppings')
  })

  it('a rejected order leaves nothing behind', async () => {
    const before = await placeOrderOrThrow(anon, pickup)
    const { error } = await placeOrder(anon, pickup, [
      { size_id: FIXTURES.sizeMediumId, quantity: 1, topping_ids: [randomUUID()] },
    ])

    expect(error).not.toBeNull()
    // The successful order either side is untouched.
    const { data } = await anon.rpc('get_order_by_token', { p_access_token: before.access_token })
    expect(data.items.length).toBe(1)
  })
})

describe('a line is identified by its extras, not just its size', () => {
  it('the same size with different extras stays two lines', async () => {
    const paid = extras.find((t) => t.price > 0)

    const order = await placeOrderOrThrow(anon, pickup, [
      { size_id: FIXTURES.sizeMediumId, quantity: 1, topping_ids: [] },
      { size_id: FIXTURES.sizeMediumId, quantity: 1, topping_ids: [paid.id] },
    ])

    expect(order.items.length).toBe(2)
  })

  it('the same size with the same extras still collapses', async () => {
    // Two lines of 15 and 10 merge to 25, which is past the per-line cap — so
    // the order is refused. If they did NOT merge, both would pass the cap
    // individually and 25 pizzas would get through.
    const paid = extras.find((t) => t.price > 0)

    const { error } = await placeOrder(anon, pickup, [
      { size_id: FIXTURES.sizeMediumId, quantity: 15, topping_ids: [paid.id] },
      { size_id: FIXTURES.sizeMediumId, quantity: 10, topping_ids: [paid.id] },
    ])

    expect(error?.message).toBe('item_unavailable')
  })

  it('the order the extras were picked in does not create a second line', async () => {
    const [a, b] = extras

    const order = await placeOrderOrThrow(anon, pickup, [
      { size_id: FIXTURES.sizeMediumId, quantity: 1, topping_ids: [a.id, b.id] },
      { size_id: FIXTURES.sizeMediumId, quantity: 1, topping_ids: [b.id, a.id] },
    ])

    expect(order.items.length).toBe(1)
    expect(order.items[0].quantity).toBe(2)
  })
})

describe('what was chosen is recorded on the order', () => {
  it('the extras come back with the line', async () => {
    const chosen = extras.slice(0, 2)

    const order = await placeOrderOrThrow(anon, pickup, [
      { size_id: FIXTURES.sizeMediumId, quantity: 1, topping_ids: chosen.map((t) => t.id) },
    ])

    const names = order.items[0].toppings.map((t) => t.name).sort()

    expect(names).toEqual(chosen.map((t) => t.name).sort())
  })

  it('a line with no extras reports an empty list, not null', async () => {
    const order = await placeOrderOrThrow(anon, pickup)

    expect(order.items[0].toppings).toEqual([])
  })

  it('the tracking link shows them too', async () => {
    const paid = extras.find((t) => t.price > 0)
    const order = await placeOrderOrThrow(anon, pickup, [
      { size_id: FIXTURES.sizeMediumId, quantity: 1, topping_ids: [paid.id] },
    ])

    const { data } = await anon.rpc('get_order_by_token', { p_access_token: order.access_token })

    expect(data.items[0].toppings.map((t) => t.name)).toContain(paid.name)
  })

  it('the recorded price is a snapshot, so a later reprice cannot rewrite history', async () => {
    const paid = extras.find((t) => t.price > 0)
    const order = await placeOrderOrThrow(anon, pickup, [
      { size_id: FIXTURES.sizeMediumId, quantity: 1, topping_ids: [paid.id] },
    ])

    const recorded = order.items[0].toppings.find((t) => t.name === paid.name)

    expect(Number(recorded.price)).toBe(paid.price)
  })
})
