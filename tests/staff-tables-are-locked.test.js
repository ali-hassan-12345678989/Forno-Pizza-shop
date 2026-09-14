import { describe, it, expect, beforeAll } from 'vitest'
import {
  anonClient,
  signedInClient,
  isReadDenied,
  isWriteDenied,
  FIXTURES,
} from './helpers/supabase.js'

// ingredients, recipes and stock_alerts are Manager/Admin data. Until Part 4
// grants those roles deliberately, no customer-side role may touch them.
//
// These tables carry no GRANT *and* no policy. That is two independent layers,
// and this file exists to catch either one being loosened by accident — most
// likely in Part 4, when the staff grants land and the GRANT layer stops
// covering for a policy mistake.
const STAFF_TABLES = ['ingredients', 'recipes', 'stock_alerts']

// Negative control. Every other assertion in this file claims "denied", and a
// helper that answered "denied" to everything would make all of them pass while
// the tables sat wide open. This proves the helper discriminates.
describe('the lockout check is not a rubber stamp', () => {
  it('reports NOT denied for a table that really is readable', async () => {
    const result = await anonClient().from('menu_items').select('id')

    expect(isReadDenied(result)).toBe(false)
  })
})

describe('staff tables are invisible to guests', () => {
  const anon = anonClient()

  it.each(STAFF_TABLES)('a guest cannot read %s', async (table) => {
    const result = await anon.from(table).select('*')

    expect(isReadDenied(result)).toBe(true)
  })

  it('a guest cannot read stock levels even by exact id', async () => {
    const result = await anon
      .from('ingredients')
      .select('stock_quantity')
      .eq('id', FIXTURES.ingredientId)

    expect(isReadDenied(result)).toBe(true)
  })

  it('a guest cannot create an ingredient', async () => {
    const { error } = await anon
      .from('ingredients')
      .insert({ name: `intruder-${Date.now()}`, unit: 'g' })

    expect(isWriteDenied(error)).toBe(true)
  })

  it('a guest cannot inflate stock levels', async () => {
    const { error, data } = await anon
      .from('ingredients')
      .update({ stock_quantity: 999999 })
      .eq('id', FIXTURES.ingredientId)
      .select()

    // Either the write is refused outright, or it matches zero rows because the
    // row is invisible. Silently updating something would be the failure.
    expect(isWriteDenied(error) || (data ?? []).length === 0).toBe(true)
  })

  it('a guest cannot delete an ingredient', async () => {
    const { error, data } = await anon
      .from('ingredients')
      .delete()
      .eq('id', FIXTURES.ingredientId)
      .select()

    expect(isWriteDenied(error) || (data ?? []).length === 0).toBe(true)
  })

  it('a guest cannot read the recipe/BOM', async () => {
    // The BOM is commercially sensitive — it is the shop's actual costings.
    const result = await anon.from('recipes').select('quantity, ingredient_id')

    expect(isReadDenied(result)).toBe(true)
  })
})

describe('staff tables stay locked for signed-in customers', () => {
  let authed

  beforeAll(async () => {
    ;({ client: authed } = await signedInClient(process.env.TEST_USER_A_EMAIL))
  })

  it.each(STAFF_TABLES)('a signed-in customer cannot read %s', async (table) => {
    // Having an account must not be mistaken for being staff.
    const result = await authed.from(table).select('*')

    expect(isReadDenied(result)).toBe(true)
  })

  it('a signed-in customer cannot add stock', async () => {
    const { error } = await authed
      .from('ingredients')
      .insert({ name: `intruder-auth-${Date.now()}`, unit: 'kg' })

    expect(isWriteDenied(error)).toBe(true)
  })
})
