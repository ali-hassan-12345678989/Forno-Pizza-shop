import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  anonClient,
  signedInClient,
  FIXTURES,
  newGuestOrder,
  newOrderItem,
  newItems,
  placeOrder,
  placeOrderOrThrow,
  randomPhone,
  findSoldOutSizeId,
  isWriteDenied,
} from './helpers/supabase.js'

// Part 2's engineering standards: recompute the total server-side on submit and
// never trust a price sent from the browser; validate every checkout field
// server-side, not just in the form; rate-limit submission.
//
// These are the tests that make those claims true rather than aspirational, so
// they are written to fail loudly the moment place_order() starts trusting its
// caller about anything that costs money.

const anon = anonClient()

/** The real menu price, read at test time — the point is that the order agrees
 *  with the menu, whatever the menu currently says. */
let mediumPrice
let largePrice
let deliveryFee

beforeAll(async () => {
  const { data: sizes } = await anon
    .from('menu_item_sizes')
    .select('id, price')
    .in('id', [FIXTURES.sizeMediumId, FIXTURES.sizeLargeId])

  mediumPrice = Number(sizes.find((s) => s.id === FIXTURES.sizeMediumId).price)
  largePrice = Number(sizes.find((s) => s.id === FIXTURES.sizeLargeId).price)

  const { data: settings } = await anon.from('shop_settings').select('delivery_fee').single()
  deliveryFee = Number(settings.delivery_fee)
})

describe('the browser cannot set a price', () => {
  it('there is no direct INSERT into orders any more', async () => {
    // Part 1 allowed this. It had to stop, because a client that can insert an
    // order row chooses its own total and place_order() becomes decoration.
    const { error } = await anon.from('orders').insert(newGuestOrder())

    expect(isWriteDenied(error)).toBe(true)
  })

  it('there is no direct INSERT into order_items either', async () => {
    const { error } = await anon.from('order_items').insert(newOrderItem(randomUUID()))

    expect(isWriteDenied(error)).toBe(true)
  })

  it('a signed-in customer has no direct INSERT either', async () => {
    // Having an account must not buy a way around pricing.
    const { client } = await signedInClient(process.env.TEST_USER_A_EMAIL)
    const { error } = await client.from('orders').insert(newGuestOrder())

    expect(isWriteDenied(error)).toBe(true)
  })

  it('place_order takes no price argument at all', async () => {
    // The strongest form of "never trust a price from the browser" is having
    // nowhere to put one. Sending extra keys must be refused outright rather
    // than quietly ignored.
    const { error } = await anon.rpc('place_order', {
      p_fulfillment_type: 'pickup',
      p_customer_name: 'Integration Test',
      p_customer_phone: randomPhone(),
      p_delivery_address: null,
      p_delivery_notes: null,
      p_items: newItems(),
      p_total: 1,
    })

    expect(error).not.toBeNull()
  })

  it('a price smuggled into an item line is ignored', async () => {
    const order = await placeOrderOrThrow(anon, { fulfillmentType: 'pickup', address: null }, [
      { size_id: FIXTURES.sizeMediumId, quantity: 1, price: 1, unit_price: 1, line_total: 1 },
    ])

    expect(Number(order.order.total)).toBe(mediumPrice)
  })
})

describe('orders are priced from the menu and the settings row', () => {
  it('a single line is charged the menu price', async () => {
    const order = await placeOrderOrThrow(anon, { fulfillmentType: 'pickup', address: null })

    expect(Number(order.order.subtotal)).toBe(mediumPrice)
    expect(Number(order.items[0].unit_price)).toBe(mediumPrice)
  })

  it('quantity multiplies the line, not the customer', async () => {
    const order = await placeOrderOrThrow(anon, { fulfillmentType: 'pickup', address: null }, [
      { size_id: FIXTURES.sizeMediumId, quantity: 3 },
    ])

    expect(Number(order.items[0].line_total)).toBe(mediumPrice * 3)
    expect(Number(order.order.subtotal)).toBe(mediumPrice * 3)
  })

  it('different sizes are priced differently', async () => {
    const order = await placeOrderOrThrow(anon, { fulfillmentType: 'pickup', address: null }, [
      { size_id: FIXTURES.sizeMediumId, quantity: 1 },
      { size_id: FIXTURES.sizeLargeId, quantity: 1 },
    ])

    expect(Number(order.order.subtotal)).toBe(mediumPrice + largePrice)
  })

  it('a delivery order carries the fee from shop_settings', async () => {
    const order = await placeOrderOrThrow(anon)

    expect(Number(order.order.delivery_fee)).toBe(deliveryFee)
    expect(Number(order.order.total)).toBe(mediumPrice + deliveryFee)
  })

  it('a pickup order carries no delivery fee', async () => {
    const order = await placeOrderOrThrow(anon, { fulfillmentType: 'pickup', address: null })

    expect(Number(order.order.delivery_fee)).toBe(0)
    expect(Number(order.order.total)).toBe(mediumPrice)
  })

  it('the total always equals the order own line items plus the fee', async () => {
    // Guards the one thing a customer would notice instantly: a receipt whose
    // parts do not add up to its total.
    const order = await placeOrderOrThrow(anon, {}, [
      { size_id: FIXTURES.sizeMediumId, quantity: 2 },
      { size_id: FIXTURES.sizeLargeId, quantity: 1 },
    ])

    const lines = order.items.reduce((sum, i) => sum + Number(i.line_total), 0)

    expect(Number(order.order.subtotal)).toBe(lines)
    expect(Number(order.order.total)).toBe(lines + Number(order.order.delivery_fee))
  })

  it('repeating a size collapses into one line', async () => {
    // Otherwise sending the same size twenty times over would be a way past the
    // per-line quantity cap.
    const order = await placeOrderOrThrow(anon, { fulfillmentType: 'pickup', address: null }, [
      { size_id: FIXTURES.sizeMediumId, quantity: 1 },
      { size_id: FIXTURES.sizeMediumId, quantity: 2 },
    ])

    expect(order.items.length).toBe(1)
    expect(order.items[0].quantity).toBe(3)
  })

  it('item name and size are snapshotted onto the order', async () => {
    // Part 4 lets the Admin rename items; a past order must still read correctly.
    const order = await placeOrderOrThrow(anon, { fulfillmentType: 'pickup', address: null })

    expect(order.items[0].item_name).toBeTruthy()
    expect(order.items[0].size_label).toBe('Medium')
  })
})

describe('checkout fields are validated in the database, not just the form', () => {
  // Each case pins the REASON, not just that something failed. Asserting only
  // "an error came back" would keep passing if the function were dropped
  // altogether, which is the one regression these tests exist to catch.
  it.each([
    ['an empty name', { name: '' }, 'invalid_name'],
    ['a one-character name', { name: 'A' }, 'invalid_name'],
    ['a whitespace-only name', { name: '   ' }, 'invalid_name'],
    ['a missing phone', { phone: '' }, 'invalid_phone'],
    ['a non-numeric phone', { phone: 'notaphone' }, 'invalid_phone'],
    ['a landline', { phone: '0512345678' }, 'invalid_phone'],
    ['a foreign number', { phone: '+15550100' }, 'invalid_phone'],
    ['a delivery order with no address', { address: null }, 'invalid_address'],
    ['a delivery order with a two-letter address', { address: 'F7' }, 'invalid_address'],
    ['an unknown fulfillment type', { fulfillmentType: 'teleport' }, 'invalid_fulfillment_type'],
    ['notes past the length limit', { notes: 'x'.repeat(201) }, 'invalid_notes'],
  ])('refuses %s', async (_label, overrides, reason) => {
    const { error } = await placeOrder(anon, overrides)

    expect(error?.message).toBe(reason)
  })

  it.each([
    ['an empty cart', [], 'empty_cart'],
    ['a zero quantity', [{ size_id: FIXTURES.sizeMediumId, quantity: 0 }], 'item_unavailable'],
    ['a negative quantity', [{ size_id: FIXTURES.sizeMediumId, quantity: -5 }], 'item_unavailable'],
    [
      'a quantity past the cap',
      [{ size_id: FIXTURES.sizeMediumId, quantity: 21 }],
      'item_unavailable',
    ],
    ['a size id that does not exist', [{ size_id: randomUUID(), quantity: 1 }], 'item_unavailable'],
  ])('refuses %s', async (_label, items, reason) => {
    const { error } = await placeOrder(anon, {}, items)

    expect(error?.message).toBe(reason)
  })

  it('a negative quantity cannot be used to discount an order', async () => {
    // The dangerous version of the above: a negative line subtracting from the
    // subtotal would let anyone order for free.
    const { error } = await placeOrder(anon, {}, [
      { size_id: FIXTURES.sizeMediumId, quantity: 2 },
      { size_id: FIXTURES.sizeLargeId, quantity: -2 },
    ])

    expect(error?.message).toBe('item_unavailable')
  })

  it('notes at exactly the limit are accepted', async () => {
    // A rule that rejects the boundary is a bug, not extra safety.
    const { error } = await placeOrder(anon, { notes: 'x'.repeat(200) })

    expect(error).toBeNull()
  })

  it('a pickup order needs no address', async () => {
    const { error } = await placeOrder(anon, { fulfillmentType: 'pickup', address: null })

    expect(error).toBeNull()
  })
})

describe('what the customer typed is cleaned up before it is stored', () => {
  it.each([
    ['0301 1111111', '+923011111111'],
    ['03021111111', '+923021111111'],
    ['3031111111', '+923031111111'],
    ['+92 304 1111111', '+923041111111'],
    ['923051111111', '+923051111111'],
    ['0306-111-1111', '+923061111111'],
  ])('stores %s as %s', async (typed, stored) => {
    // Must stay in step with normalisePhone() in src/lib/validation.js — the
    // kitchen should never see one customer under two different numbers.
    const order = await placeOrderOrThrow(anon, {
      phone: typed,
      fulfillmentType: 'pickup',
      address: null,
    })

    expect(order.order.customer_phone).toBe(stored)
  })

  it('trims surrounding whitespace from the name', async () => {
    const order = await placeOrderOrThrow(anon, {
      name: '  Integration Test  ',
      fulfillmentType: 'pickup',
      address: null,
    })

    expect(order.order.customer_name).toBe('Integration Test')
  })

  it('drops an address sent with a pickup order', async () => {
    // There is nowhere to deliver a pickup order, so keeping the address would
    // only mislead whoever reads the ticket.
    const order = await placeOrderOrThrow(anon, {
      fulfillmentType: 'pickup',
      address: 'House 12, Street 4, F-7/2, Islamabad',
    })

    expect(order.order.delivery_address).toBeNull()
  })

  it('stores empty notes as null rather than an empty string', async () => {
    const order = await placeOrderOrThrow(anon, {
      notes: '   ',
      fulfillmentType: 'pickup',
      address: null,
    })

    expect(order.order.delivery_notes).toBeNull()
  })
})

describe('unavailable items are refused, not quietly dropped', () => {
  it('a sold-out item cannot be ordered', async () => {
    // Runs only when something actually is unavailable. This used to lean on a
    // pizza the Part 2 seed marked sold out for ever, which Part 3 removed —
    // availability is now driven by real stock, so on a well-stocked shop there
    // is legitimately nothing to find.
    //
    // The case is not lost: supabase/verify_stock.sql takes an ingredient to
    // zero and proves the dish it belongs to is refused with item_unavailable.
    // It can do that because it is allowed to write to the ingredients table,
    // and this suite deliberately is not.
    const soldOutSizeId = await findSoldOutSizeId(anon)
    if (!soldOutSizeId) return

    const { error } = await placeOrder(anon, {}, [{ size_id: soldOutSizeId, quantity: 1 }])

    expect(error?.message).toBe('item_unavailable')
  })

  it('one unavailable line fails the whole order', async () => {
    // Placing the rest anyway would hand the customer an order missing what
    // they actually wanted, and charge them for the difference in confusion.
    //
    // An id for a size that does not exist is unavailable in exactly the sense
    // that matters here, and unlike a sold-out dish it is always available to
    // test with — so this assertion runs on every menu, not just an unlucky one.
    const { error } = await placeOrder(anon, {}, [
      { size_id: FIXTURES.sizeMediumId, quantity: 1 },
      { size_id: randomUUID(), quantity: 1 },
    ])

    expect(error?.message).toBe('item_unavailable')
  })

  it('and the good line is not placed on its own', async () => {
    // The other half of "fails the whole order": nothing may reach the kitchen.
    const phone = randomPhone()
    await placeOrder(anon, { phone }, [
      { size_id: FIXTURES.sizeMediumId, quantity: 1 },
      { size_id: randomUUID(), quantity: 1 },
    ])

    const { client } = await signedInClient(process.env.TEST_USER_A_EMAIL)
    const { data } = await client
      .from('orders')
      .select('id')
      .eq('customer_phone', `+92${phone.slice(1)}`)

    expect(data ?? []).toHaveLength(0)
  })

  it('a failed order leaves nothing behind', async () => {
    // The order row is inserted before the items are priced, so a rejection has
    // to roll the whole thing back. A half-written order would reach the kitchen.
    const phone = randomPhone()
    await placeOrder(anon, { phone }, [{ size_id: randomUUID(), quantity: 1 }])

    const { client } = await signedInClient(process.env.TEST_USER_A_EMAIL)
    const { data } = await client
      .from('orders')
      .select('id')
      .eq('customer_phone', `+92${phone.slice(1)}`)

    expect(data ?? []).toHaveLength(0)
  })
})

describe('order submission is rate-limited', () => {
  it('a burst from one number is cut off', async () => {
    const phone = randomPhone()
    const results = []

    for (let i = 0; i < 7; i += 1) {
      const { error } = await placeOrder(anon, { phone })
      results.push(error)
    }

    expect(results.filter((e) => e === null).length).toBeLessThanOrEqual(5)
    expect(results.at(-1)?.message).toBe('rate_limited')
  })

  it('a different customer is unaffected by someone else hitting the limit', async () => {
    const { error } = await placeOrder(anon, { fulfillmentType: 'pickup', address: null })

    expect(error).toBeNull()
  })
})

describe('who the order belongs to is decided by the session', () => {
  it('an order placed with no session is a guest order', async () => {
    const order = await placeOrderOrThrow(anon, { fulfillmentType: 'pickup', address: null })

    expect(order.order.user_id).toBeNull()
  })

  it('an order placed while signed in is attached to that account', async () => {
    const { client, userId } = await signedInClient(process.env.TEST_USER_A_EMAIL)
    const order = await placeOrderOrThrow(client, {
      name: 'Alice Test',
      fulfillmentType: 'pickup',
      address: null,
    })

    expect(order.order.user_id).toBe(userId)
  })

  it('there is no way to file an order under somebody else', async () => {
    // user_id is read from the verified JWT inside the function; it is not a
    // parameter, so this is unreachable rather than merely disallowed.
    const { userId: aliceId } = await signedInClient(process.env.TEST_USER_A_EMAIL)
    const order = await placeOrderOrThrow(anon, { fulfillmentType: 'pickup', address: null })

    expect(order.order.user_id).not.toBe(aliceId)
  })

  it('an order can never be created already delivered', async () => {
    // Status is set by the function, so a customer cannot self-promote an order
    // and unlock reviewing something they never received.
    const order = await placeOrderOrThrow(anon, { fulfillmentType: 'pickup', address: null })

    expect(order.order.status).toBe('placed')
  })
})

describe('the tracking token handed back at placement', () => {
  it('comes back exactly once, at creation', async () => {
    const order = await placeOrderOrThrow(anon, { fulfillmentType: 'pickup', address: null })

    expect(order.access_token).toBeTruthy()
    // ...and never inside the order itself, where it would end up rendered.
    expect(order.order.access_token).toBeUndefined()
  })

  it('reads the order back through get_order_by_token', async () => {
    const order = await placeOrderOrThrow(anon, { fulfillmentType: 'pickup', address: null })

    const { data } = await anon.rpc('get_order_by_token', {
      p_access_token: order.access_token,
    })

    expect(data.order.id).toBe(order.order.id)
    expect(data.order.access_token).toBeUndefined()
  })

  it('is different for every order', async () => {
    const a = await placeOrderOrThrow(anon, { fulfillmentType: 'pickup', address: null })
    const b = await placeOrderOrThrow(anon, { fulfillmentType: 'pickup', address: null })

    expect(a.access_token).not.toBe(b.access_token)
    expect(a.order.order_number).not.toBe(b.order.order_number)
  })

  it('comes with a short order number for the customer to quote', async () => {
    const order = await placeOrderOrThrow(anon, { fulfillmentType: 'pickup', address: null })

    expect(order.order.order_number).toMatch(/^\d{4,}$/)
  })

  it('logs the placement in the status history automatically', async () => {
    const order = await placeOrderOrThrow(anon, { fulfillmentType: 'pickup', address: null })

    expect(order.status_history.length).toBeGreaterThan(0)
    expect(order.status_history[0].status).toBe('placed')
  })
})

describe('malformed carts cannot bank an empty order', () => {
  it('a line with no size id is refused rather than skipped', async () => {
    // Left unguarded this balances out at nothing requested, nothing priced,
    // and produces an order with no food on it and a delivery fee attached.
    const { error } = await placeOrder(anon, {}, [{ quantity: 1 }])

    expect(error?.message).toBe('item_unavailable')
  })

  it('an order can never be placed with zero items', async () => {
    const { error } = await placeOrder(anon, {}, [{ quantity: 2 }, { quantity: 3 }])

    expect(error?.message).toBe('item_unavailable')
  })
})
