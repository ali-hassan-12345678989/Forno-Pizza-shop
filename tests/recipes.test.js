import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { anonClient, signedInClient, placeOrderOrThrow } from './helpers/supabase.js'

// Part 3, task 3: the recipe lookup.
//
// The arithmetic — that a Large scales, that a shared ingredient totals into one
// row, that quantity multiplies by how many were ordered — is checked in
// supabase/verify_recipes.sql, because order_ingredient_requirements() is
// revoked from every customer-side role and this suite runs on the anon key.
//
// What this file covers is the thing that revoking is FOR. Adding two SECURITY
// DEFINER functions over ingredients and recipes creates a new way into tables
// that are otherwise denied at both layers. If either one were left callable,
// the lockdown in staff-tables-are-locked.test.js would still pass while the
// same data walked out through a function call.

const anon = anonClient()
const STAFF_FUNCTIONS = ['order_ingredient_requirements', 'sizes_missing_recipes']

const argsFor = {
  order_ingredient_requirements: { p_order_id: randomUUID() },
  sizes_missing_recipes: {},
}

describe('the denial check is not a rubber stamp', () => {
  it('a function that IS granted answers normally', async () => {
    // Without this, "everything is denied" could equally mean "every rpc call
    // in this file is spelled wrong".
    const { error } = await anon.rpc('get_order_by_token', {
      p_access_token: randomUUID(),
    })

    expect(error).toBeNull()
  })
})

describe('the recipe functions are not reachable from the browser', () => {
  it.each(STAFF_FUNCTIONS)('a guest cannot call %s', async (fn) => {
    const { error } = await anon.rpc(fn, argsFor[fn])

    // Specifically a privilege refusal. "Could not find the function" would
    // mean the file has not been run, which proves nothing about access.
    expect(error?.message).toMatch(/permission denied/i)
  })

  it.each(STAFF_FUNCTIONS)('a signed-in customer cannot call %s either', async (fn) => {
    // Having an account is not the same as working here.
    const { client } = await signedInClient(process.env.TEST_USER_A_EMAIL)
    const { error } = await client.rpc(fn, argsFor[fn])

    expect(error?.message).toMatch(/permission denied/i)
  })
})

describe('holding your own order does not open the recipe book', () => {
  let order

  beforeAll(async () => {
    order = await placeOrderOrThrow(anon, { name: 'Lookup Probe' })
  })

  it('refuses the requirements for an order the caller just placed', async () => {
    // The sharpest version of the leak: the id is genuinely theirs, the order is
    // genuinely real, and the answer would still be the shop's costings —
    // exact gram weights for everything on the ticket.
    const { error } = await anon.rpc('order_ingredient_requirements', {
      p_order_id: order.order.id,
    })

    expect(error?.message).toMatch(/permission denied/i)
  })

  it('refuses it to a signed-in customer holding their own order too', async () => {
    const { client } = await signedInClient(process.env.TEST_USER_A_EMAIL)
    const own = await placeOrderOrThrow(client, { name: 'Lookup Probe' })

    const { error } = await client.rpc('order_ingredient_requirements', {
      p_order_id: own.order.id,
    })

    expect(error?.message).toMatch(/permission denied/i)
  })

  it('still lets them read the order itself', async () => {
    // The point is that recipes are closed, not that orders are. A customer
    // reading their own order back must keep working exactly as before.
    const { data, error } = await anon.rpc('get_order_by_token', {
      p_access_token: order.access_token,
    })

    expect(error).toBeNull()
    expect(data.order.order_number).toBe(order.order.order_number)
    expect(data.items.length).toBeGreaterThan(0)
  })

  it('and the order still carries no ingredient information', async () => {
    // Belt and braces: the shape a customer CAN read must not have quietly
    // grown a recipe field.
    //
    // The probe is deliberately not called anything containing these words —
    // the customer name is echoed back in the payload, so a fixture named
    // "Recipe Probe" makes this assertion fail against perfectly good code.
    const { data } = await anon.rpc('get_order_by_token', {
      p_access_token: order.access_token,
    })
    const asText = JSON.stringify(data)

    expect(asText).not.toMatch(/ingredient/i)
    expect(asText).not.toMatch(/recipe/i)
  })
})
