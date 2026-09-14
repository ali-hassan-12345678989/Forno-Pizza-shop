import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  anonClient,
  newGuestOrder,
  newOrderItem,
  isWriteDenied,
  FIXTURES,
} from './helpers/supabase.js'

// FR-4.1 to FR-4.3: reviews are public, but a rating is only worth anything if
// it came from someone who actually received the food. The policy ties every
// review to a delivered order, and item reviews to an item that was in it.
describe('reviews are readable by everyone', () => {
  const anon = anonClient()

  it('a guest can read reviews without an account', async () => {
    const { data, error } = await anon.from('reviews').select('rating, comment')

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })
})

describe('reviews cannot be faked', () => {
  const anon = anonClient()

  it('an order that was never delivered cannot be reviewed', async () => {
    const order = newGuestOrder()
    await anon.from('orders').insert(order)
    await anon.from('order_items').insert(newOrderItem(order.id))

    const { error } = await anon.from('reviews').insert({
      order_id: order.id,
      menu_item_id: FIXTURES.menuItemId,
      rating: 5,
      comment: 'Five stars, never actually arrived',
    })

    expect(isWriteDenied(error)).toBe(true)
  })

  it('a made-up order id cannot be reviewed', async () => {
    const { error } = await anon.from('reviews').insert({
      order_id: randomUUID(),
      menu_item_id: FIXTURES.menuItemId,
      rating: 5,
    })

    expect(error).not.toBeNull()
  })

  it('a review cannot be posted with no order at all', async () => {
    // order_id is NOT NULL precisely so a review can never float free.
    const { error } = await anon.from('reviews').insert({
      menu_item_id: FIXTURES.menuItemId,
      rating: 5,
    })

    expect(error).not.toBeNull()
  })

  it('an out-of-range rating is rejected', async () => {
    const order = newGuestOrder()
    await anon.from('orders').insert(order)

    const { error } = await anon.from('reviews').insert({
      order_id: order.id,
      menu_item_id: FIXTURES.menuItemId,
      rating: 99,
    })

    expect(error).not.toBeNull()
  })
})
