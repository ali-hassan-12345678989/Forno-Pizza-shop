import { describe, it, expect } from 'vitest'
import { anonClient, signedInClient, isWriteDenied } from './helpers/supabase.js'

// The shop's own details drive the header, footer and — critically — the
// delivery fee used to price every order. Customers must be able to read them
// and must never be able to change them.
describe('shop settings are public to read', () => {
  const anon = anonClient()

  it('a guest can load the settings row', async () => {
    const { data, error } = await anon.from('shop_settings').select('*').single()

    expect(error).toBeNull()
    expect(data.name).toBeTruthy()
  })

  it('every field the app depends on is present', async () => {
    const { data } = await anon.from('shop_settings').select('*').single()

    for (const field of [
      'name',
      'tagline',
      'phone_display',
      'phone_e164',
      'address',
      'hours',
      'delivery_eta',
      'pickup_eta',
      'delivery_fee',
    ]) {
      expect(data[field], `${field} must not be empty`).not.toBeNull()
      expect(String(data[field]).length, `${field} must not be blank`).toBeGreaterThan(0)
    }
  })

  it('the delivery fee is a usable number', async () => {
    // Task 6 recomputes order totals from this value server-side, so a null or
    // a string here would silently produce wrong money.
    const { data } = await anon.from('shop_settings').select('delivery_fee').single()

    expect(Number.isFinite(Number(data.delivery_fee))).toBe(true)
    expect(Number(data.delivery_fee)).toBeGreaterThanOrEqual(0)
  })

  it('there is exactly one row', async () => {
    // The app reads .single(); two rows would make which settings apply a
    // coin toss. A check constraint on id enforces this.
    const { data } = await anon.from('shop_settings').select('id')

    expect(data.length).toBe(1)
    expect(data[0].id).toBe(1)
  })
})

describe('shop settings cannot be changed by customers', () => {
  const anon = anonClient()

  it('a guest cannot raise the delivery fee', async () => {
    const { error, data } = await anon
      .from('shop_settings')
      .update({ delivery_fee: 99999 })
      .eq('id', 1)
      .select()

    expect(isWriteDenied(error) || (data ?? []).length === 0).toBe(true)
  })

  it('a guest cannot rewrite the shop phone number', async () => {
    // A tampered phone number would send customers to someone else.
    const { error, data } = await anon
      .from('shop_settings')
      .update({ phone_display: '000 000 0000' })
      .eq('id', 1)
      .select()

    expect(isWriteDenied(error) || (data ?? []).length === 0).toBe(true)
  })

  it('a guest cannot insert a second settings row', async () => {
    const { error } = await anon.from('shop_settings').insert({
      id: 2,
      name: 'Fake',
      tagline: 'x',
      phone_display: 'x',
      phone_e164: 'x',
      address: 'x',
      hours: 'x',
      delivery_eta: 'x',
      pickup_eta: 'x',
      delivery_fee: 0,
    })

    expect(error).not.toBeNull()
  })

  it('a signed-in customer cannot change settings either', async () => {
    const { client } = await signedInClient(process.env.TEST_USER_A_EMAIL)

    const { error, data } = await client
      .from('shop_settings')
      .update({ delivery_fee: 0 })
      .eq('id', 1)
      .select()

    expect(isWriteDenied(error) || (data ?? []).length === 0).toBe(true)
  })

  it('the fee is still what it was after all those attempts', async () => {
    const { data } = await anon.from('shop_settings').select('delivery_fee').single()

    expect(Number(data.delivery_fee)).not.toBe(99999)
  })
})
