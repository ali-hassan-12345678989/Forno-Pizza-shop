import { describe, it, expect } from 'vitest'
import { anonClient, adminClient, staffConfigured, placeOrder } from './helpers/supabase.js'

// The fixes that came out of the 2026-09-24 security audit. Each test here
// exists because something was found, so each one names what it is holding
// shut rather than just asserting a shape.

const anon = anonClient()

describe('deleting a menu size cannot quietly take its recipe with it', () => {
  it.runIf(staffConfigured())(
    'refuses without confirmation, and leaves the size where it was',
    async () => {
      const { client: admin } = await adminClient()
      const { data: items } = await admin.rpc('admin_menu_items')

      // A size nothing has ordered, so the older size_has_orders guard cannot
      // fire first and mask the one under test. Every seeded size has a recipe.
      const victim = items
        .flatMap((item) => (item.sizes ?? []).map((size) => ({ ...size, item: item.name })))
        .find((size) => Number(size.order_count) === 0)

      expect(victim, 'no unordered size to test against').toBeTruthy()

      const { error } = await admin.rpc('admin_delete_menu_size', { p_id: victim.id })

      expect(error?.message).toBe('size_has_recipe')

      // The refusal is worth nothing if the row went anyway.
      const { data: after } = await admin.rpc('admin_menu_items')
      const survived = after
        .flatMap((item) => item.sizes ?? [])
        .some((size) => size.id === victim.id)

      expect(survived).toBe(true)
    },
  )

  it.runIf(staffConfigured())('is still closed to everyone who is not the Admin', async () => {
    const { data: items } = await anon.from('menu_item_sizes').select('id').limit(1)
    const { error } = await anon.rpc('admin_delete_menu_size', {
      p_id: items[0].id,
      // Even handing it the confirmation does not get a stranger past the gate.
      p_confirm_recipe_loss: true,
    })

    expect(error).toBeTruthy()
    expect(error.message).not.toBe('size_has_recipe')
  })
})

describe('a tracking link is still a working credential', () => {
  // The audit added a 30-day window to get_order_by_token(). The window itself
  // cannot be exercised from here — proving it would mean backdating
  // orders.created_at, and no client holds a grant that can write that column,
  // which is the same protection this test relies on everywhere else. What is
  // testable, and what would actually hurt if it broke, is that a token issued
  // now still reads back the order it belongs to.
  it('reads back an order placed a moment ago', async () => {
    const { data, error } = await placeOrder(anon)
    expect(error).toBeNull()

    const { data: read } = await anon.rpc('get_order_by_token', {
      p_access_token: data.access_token,
    })

    expect(read?.order?.id).toBe(data.order.id)
    expect(read.order.access_token).toBeUndefined()
  })

  it('still refuses a token that belongs to no order', async () => {
    const { data } = await anon.rpc('get_order_by_token', {
      p_access_token: '00000000-0000-0000-0000-000000000000',
    })

    expect(data).toBeNull()
  })
})

describe('over-long input is refused, not silently shortened', () => {
  // Covered at the boundary in validation-parity.test.js. This is the blunt
  // version of the same thing: the pathological input the audit actually sent.
  it('refuses a 500,000-character name instead of storing the first 80', async () => {
    const { data, error } = await placeOrder(anon, { name: 'A'.repeat(500_000) })

    expect(error?.message).toBe('name_too_long')
    expect(data).toBeNull()
  })
})
