import { describe, expect, it } from 'vitest'

import { MAX_STOCK_RECEIPT, MIN_STOCK_RECEIPT } from '../src/config/inventory.js'
import {
  adminClient,
  anonClient,
  managerClient,
  signedInClient,
  staffConfigured,
} from './helpers/supabase.js'

const customerEmail = process.env.TEST_USER_A_EMAIL
const PERMISSION_DENIED = '42501'

/**
 * Every booking here is 0.001 of a unit.
 *
 * There is no client-side way to take stock back out, so anything these tests
 * add stays added. Part 3 already taught this the hard way — a cleanup that
 * refunded orders it had never charged inflated the shop fourteenfold. A
 * thousandth of a gram per run is small enough to never matter, and
 * numeric(12,3) stores it exactly, so the arithmetic assertions stay sharp.
 */
const TINY = 0.001

async function firstIngredient(client) {
  const { data } = await client.rpc('staff_ingredients')
  return data[0]
}

/**
 * Re-read by id, never by position. staff_ingredients() orders by urgency, so
 * a row that crosses a threshold mid-test moves — and comparing "the first row"
 * before and after would then be comparing two different ingredients.
 */
async function ingredientById(client, id) {
  const { data } = await client.rpc('staff_ingredients')
  return data.find((r) => r.id === id)
}

describe('only the Manager can book in stock', () => {
  it('a guest cannot call it', async () => {
    const { error } = await anonClient().rpc('receive_stock', {
      p_ingredient_id: '00000000-0000-4000-8000-000000000000',
      p_quantity: TINY,
    })
    expect(error).toBeTruthy()
    expect(
      error.code,
      `refused with ${error.code} (${error.message}); a missing function errors too`,
    ).toBe(PERMISSION_DENIED)
  })

  it('a signed-in customer is refused', async () => {
    const { client } = await signedInClient(customerEmail)
    const { error } = await client.rpc('receive_stock', {
      p_ingredient_id: '00000000-0000-4000-8000-000000000000',
      p_quantity: TINY,
    })
    expect(error).toBeTruthy()
    expect(error.message).toContain('not_manager')
  })

  /** FR-7.6: the Admin may look at inventory but never change it. */
  it.skipIf(!staffConfigured())(
    'the ADMIN is refused, even though they can read stock',
    async () => {
      const admin = await adminClient()

      // They can see it...
      const { data: visible, error: readError } = await admin.client.rpc('staff_ingredients')
      expect(readError).toBeNull()
      expect(visible.length).toBeGreaterThan(0)

      // ...and cannot touch it.
      const { error } = await admin.client.rpc('receive_stock', {
        p_ingredient_id: visible[0].id,
        p_quantity: TINY,
      })
      expect(error, 'FR-7.6: the Admin must not be able to add stock').toBeTruthy()
      expect(error.message).toContain('not_manager')
    },
  )

  it.skipIf(!staffConfigured())(
    'the admin cannot move stock by any amount, but the manager can',
    async () => {
      const admin = await adminClient()
      const target = await firstIngredient(admin.client)
      const before = Number(target.stock_quantity)

      for (const q of [TINY, -TINY, 0, 1000]) {
        const { error } = await admin.client.rpc('receive_stock', {
          p_ingredient_id: target.id,
          p_quantity: q,
        })
        expect(error, `the admin was allowed to send ${q}`).toBeTruthy()
      }

      const afterAdmin = Number((await ingredientById(admin.client, target.id)).stock_quantity)
      expect(afterAdmin, 'the admin moved stock').toBe(before)

      // POSITIVE CONTROL. Without this the assertion above passes just as well
      // against a database where receive_stock() does not exist at all -
      // "nothing moved" is not evidence of a refusal unless something CAN move.
      const manager = await managerClient()
      const { data, error } = await manager.client.rpc('receive_stock', {
        p_ingredient_id: target.id,
        p_quantity: TINY,
      })
      expect(error, 'control: the manager must be able to do what the admin cannot').toBeNull()
      expect(Number(data[0].stock_quantity)).toBeCloseTo(before + TINY, 3)
    },
  )
})

describe.skipIf(!staffConfigured())('booking in a delivery', () => {
  it('adds exactly what arrived (FR-6.2)', async () => {
    const { client } = await managerClient()
    const target = await firstIngredient(client)
    const before = Number(target.stock_quantity)

    const { data, error } = await client.rpc('receive_stock', {
      p_ingredient_id: target.id,
      p_quantity: TINY,
    })
    expect(error).toBeNull()
    expect(Number(data[0].stock_quantity)).toBeCloseTo(before + TINY, 3)
  })

  /**
   * The distinction the whole function rests on. If it SET rather than ADDED,
   * the second call would leave the total unchanged instead of doubled — and
   * every order placed between the two would be silently un-deducted.
   */
  it('adds to what is there rather than replacing it', async () => {
    const { client } = await managerClient()
    const target = await firstIngredient(client)
    const before = Number(target.stock_quantity)

    await client.rpc('receive_stock', { p_ingredient_id: target.id, p_quantity: TINY })
    const { data } = await client.rpc('receive_stock', {
      p_ingredient_id: target.id,
      p_quantity: TINY,
    })

    expect(Number(data[0].stock_quantity)).toBeCloseTo(before + TINY * 2, 3)
  })

  it('hands back the updated row, not the old one', async () => {
    const { client } = await managerClient()
    const target = await firstIngredient(client)
    const { data } = await client.rpc('receive_stock', {
      p_ingredient_id: target.id,
      p_quantity: TINY,
    })
    const row = data[0]
    expect(row.id).toBe(target.id)
    expect(row.name).toBe(target.name)
    expect(row.unit).toBe(target.unit)
    expect(row.is_low).toBe(Number(row.stock_quantity) < Number(row.low_stock_threshold))
    expect(row.is_out).toBe(Number(row.stock_quantity) === 0)
  })

  it('refuses an unknown ingredient', async () => {
    const { client } = await managerClient()
    const { error } = await client.rpc('receive_stock', {
      p_ingredient_id: '00000000-0000-4000-8000-000000000000',
      p_quantity: TINY,
    })
    expect(error.message).toContain('ingredient_not_found')
  })
})

describe.skipIf(!staffConfigured())('what counts as a delivery', () => {
  async function attempt(quantity) {
    const { client } = await managerClient()
    const target = await firstIngredient(client)
    const before = Number(target.stock_quantity)
    const { error } = await client.rpc('receive_stock', {
      p_ingredient_id: target.id,
      p_quantity: quantity,
    })
    const after = Number((await ingredientById(client, target.id)).stock_quantity)
    return { error, moved: after !== before }
  }

  it(`refuses the minimum itself (${MIN_STOCK_RECEIPT})`, async () => {
    const { error, moved } = await attempt(MIN_STOCK_RECEIPT)
    expect(error.message).toContain('invalid_quantity')
    expect(moved).toBe(false)
  })

  it('refuses a negative quantity, which would be a silent deduction', async () => {
    const { error, moved } = await attempt(-5)
    expect(error.message).toContain('invalid_quantity')
    expect(moved).toBe(false)
  })

  it('refuses null', async () => {
    const { error } = await attempt(null)
    expect(error.message).toContain('invalid_quantity')
  })

  /**
   * Pins MAX_STOCK_RECEIPT to c_max_receipt in receive_stock(). Only the
   * rejecting side is probed: accepting the maximum would permanently add a
   * million units to real stock, and there is no way to take it back out.
   */
  it(`refuses anything past MAX_STOCK_RECEIPT (${MAX_STOCK_RECEIPT})`, async () => {
    const { error, moved } = await attempt(MAX_STOCK_RECEIPT + 1)
    expect(error?.message, 'the JS cap and the SQL cap have drifted apart').toContain(
      'quantity_too_large',
    )
    expect(moved).toBe(false)
  })
})
