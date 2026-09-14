import { describe, it, expect, beforeAll } from 'vitest'
import { anonClient, signedInClient, FIXTURES } from './helpers/supabase.js'

// FR-1.1 / FR-1.7: the menu has to be browsable with no account, and a customer
// must be able to see sold-out state before trying to order.
describe('menu is readable without an account', () => {
  const anon = anonClient()

  it('a guest can list menu items', async () => {
    const { data, error } = await anon.from('menu_items').select('id, name, is_active')

    expect(error).toBeNull()
    expect(data.length).toBeGreaterThan(0)
  })

  it('only active items are ever exposed', async () => {
    const { data } = await anon.from('menu_items').select('id, is_active')

    // The policy filters on is_active, so an inactive row must never appear
    // even though we are asking for every column unfiltered.
    expect(data.every((item) => item.is_active === true)).toBe(true)
  })

  it('a guest can read sizes and prices', async () => {
    const { data, error } = await anon
      .from('menu_item_sizes')
      .select('size, price')
      .eq('menu_item_id', FIXTURES.menuItemId)

    expect(error).toBeNull()
    expect(data.length).toBe(2)
    expect(data.every((size) => Number(size.price) > 0)).toBe(true)
  })

  it('the nested menu query the app actually uses works', async () => {
    // Mirrors the join in src/App.jsx — an embedded resource is filtered by its
    // own policy, so this proves menu_item_sizes is reachable through the join.
    const { data, error } = await anon
      .from('menu_items')
      .select('id, name, menu_item_sizes(size, price)')

    expect(error).toBeNull()
    expect(data[0].menu_item_sizes.length).toBeGreaterThan(0)
  })

  it('sold-out state is visible to guests', async () => {
    const { data, error } = await anon.from('menu_items').select('is_sold_out')

    expect(error).toBeNull()
    expect(data.every((item) => typeof item.is_sold_out === 'boolean')).toBe(true)
  })
})

describe('menu stays readable once signed in', () => {
  let authed

  beforeAll(async () => {
    ;({ client: authed } = await signedInClient(process.env.TEST_USER_A_EMAIL))
  })

  it('a signed-in customer sees the menu too', async () => {
    const { data, error } = await authed.from('menu_items').select('id')

    expect(error).toBeNull()
    expect(data.length).toBeGreaterThan(0)
  })
})
