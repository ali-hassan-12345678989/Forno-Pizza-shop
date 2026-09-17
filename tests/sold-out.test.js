import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { anonClient, signedInClient, placeOrder } from './helpers/supabase.js'
import { fetchMenu } from '../src/api/menu.js'

// Part 3, task 7: a dish whose ingredients have run out stops being orderable,
// with nobody having to remember to switch it off.
//
// Whether the ENGINE gets that right — set an ingredient to zero and watch the
// right pizza go unavailable — is checked in supabase/verify_stock.sql, because
// it needs to write to a table no customer role can touch.
//
// What this file covers is the customer's side of it: that the menu a browser
// actually receives reflects both flags, that neither can be set from outside,
// and that an unavailable dish is refused if somebody orders it anyway.

const anon = anonClient()

describe('the menu a browser receives', () => {
  it('reports a dish as sold out when either flag is set', async () => {
    // The API folds two database columns into one answer: is_sold_out is the
    // shop's own decision, out_of_stock is the engine's observation. A customer
    // does not need the distinction — either way they cannot order it.
    const { data } = await anon.from('menu_items').select('name, is_sold_out, out_of_stock')
    const menu = await fetchMenu()

    for (const row of data) {
      const item = menu.find((m) => m.name === row.name)
      if (!item) continue
      expect(item.isSoldOut, `${row.name} disagrees with the database`).toBe(
        Boolean(row.is_sold_out) || Boolean(row.out_of_stock),
      )
    }
  })

  it('carries both flags so neither can be lost in the join', async () => {
    const { data, error } = await anon.from('menu_items').select('is_sold_out, out_of_stock')

    expect(error).toBeNull()
    expect(data.length).toBeGreaterThan(0)
    for (const row of data) {
      expect(row).toHaveProperty('is_sold_out')
      expect(row).toHaveProperty('out_of_stock')
    }
  })
})

describe('availability is not the customer to decide', () => {
  it('a guest cannot put a dish back on the menu', async () => {
    const { data: target } = await anon.from('menu_items').select('id').limit(1).single()
    const { error, data } = await anon
      .from('menu_items')
      .update({ out_of_stock: false, is_sold_out: false })
      .eq('id', target.id)
      .select()

    // Either refused outright, or it matched no rows — menu_items has no
    // UPDATE grant and no UPDATE policy. Silently succeeding is the failure.
    expect(error !== null || (data ?? []).length === 0).toBe(true)
  })

  it('a guest cannot recompute availability', async () => {
    // refresh_sold_out() is SECURITY DEFINER over menu_items. Left callable, a
    // visitor could mark the entire menu unavailable.
    const { error } = await anon.rpc('refresh_sold_out', { p_ingredient_id: randomUUID() })

    expect(error?.message).toMatch(/permission denied/i)
  })

  it('a signed-in customer cannot either', async () => {
    const { client } = await signedInClient(process.env.TEST_USER_A_EMAIL)
    const { error } = await client.rpc('refresh_sold_out', { p_ingredient_id: randomUUID() })

    expect(error?.message).toMatch(/permission denied/i)
  })
})

describe('an unavailable dish cannot be ordered', () => {
  it('is refused as unavailable, not as a stock shortage', async () => {
    // The distinction matters to the customer. "Unavailable" points them at the
    // menu, where it is marked; "something ran out" sounds like bad luck they
    // could retry past.
    const menu = await fetchMenu()
    const unavailable = menu.find((m) => m.isSoldOut && m.sizes.length > 0)

    if (!unavailable) {
      // Nothing is off the menu today, so there is nothing to prove here.
      return
    }

    const { error } = await placeOrder(anon, { name: 'Sold Out Probe' }, [
      { size_id: unavailable.sizes[0].id, quantity: 1, topping_ids: [] },
    ])

    expect(error?.message).toBe('item_unavailable')
  })

  it('still lets an available dish through', async () => {
    // The negative control: "everything is refused" would satisfy the test
    // above and be completely wrong.
    const menu = await fetchMenu()
    const available = menu.find((m) => !m.isSoldOut && m.sizes.length > 0)

    expect(available, 'the whole menu is unavailable').toBeTruthy()

    const { data, error } = await placeOrder(anon, { name: 'Sold Out Probe' }, [
      { size_id: available.sizes[0].id, quantity: 1, topping_ids: [] },
    ])

    expect(error).toBeNull()
    expect(data.order.status).toBe('placed')
  })
})
