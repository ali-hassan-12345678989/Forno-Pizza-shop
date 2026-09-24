import { describe, it, expect } from 'vitest'
import {
  normalisePhone,
  MIN_NAME_LENGTH,
  MAX_NAME_LENGTH,
  MIN_ADDRESS_LENGTH,
  MAX_ADDRESS_LENGTH,
  MAX_NOTES_LENGTH,
  validateName,
  validateAddress,
} from '../src/lib/validation.js'
import { MAX_QUANTITY } from '../src/context/CartContext.jsx'
import { anonClient, placeOrder, FIXTURES } from './helpers/supabase.js'

// The checkout rules exist in two places that cannot share code: src/lib for the
// form, and place_order() for the database. The form version is a courtesy; the
// database version is the one that decides. If they drift, a customer is told
// their input is fine and then rejected by the server with no explanation.
//
// So this file does not test the rules. It tests that the two copies AGREE —
// every assertion reads its limit from the JavaScript constant and then probes
// the real database at exactly that boundary.

const anon = anonClient()
const pickup = { fulfillmentType: 'pickup', address: null }

describe('the name limit matches on both sides', () => {
  it(`accepts a name of exactly ${MIN_NAME_LENGTH}`, async () => {
    const { error } = await placeOrder(anon, { ...pickup, name: 'A'.repeat(MIN_NAME_LENGTH) })

    expect(error).toBeNull()
  })

  it(`rejects a name of ${MIN_NAME_LENGTH - 1}`, async () => {
    const { error } = await placeOrder(anon, { ...pickup, name: 'A'.repeat(MIN_NAME_LENGTH - 1) })

    expect(error?.message).toBe('invalid_name')
  })

  it(`accepts a name of exactly ${MAX_NAME_LENGTH}`, async () => {
    const { error } = await placeOrder(anon, { ...pickup, name: 'A'.repeat(MAX_NAME_LENGTH) })

    expect(error).toBeNull()
  })

  // Before the audit this passed silently and stored 80 characters, so the
  // kitchen got a different name from the one the customer typed. The database
  // refuses now, and the form refuses first.
  it(`rejects a name of ${MAX_NAME_LENGTH + 1} rather than trimming it`, async () => {
    const { error } = await placeOrder(anon, { ...pickup, name: 'A'.repeat(MAX_NAME_LENGTH + 1) })

    expect(error?.message).toBe('name_too_long')
  })

  it('the form catches an over-long name before the database has to', () => {
    expect(validateName('A'.repeat(MAX_NAME_LENGTH))).toBeNull()
    expect(validateName('A'.repeat(MAX_NAME_LENGTH + 1))).toBe('nameTooLong')
  })

  // A stored name is only proof of no truncation if it is read back.
  it('stores the name whole, not shortened to the limit', async () => {
    const name = 'Muhammad '.repeat(8).trim().slice(0, MAX_NAME_LENGTH)
    const { data, error } = await placeOrder(anon, { ...pickup, name })

    expect(error).toBeNull()
    expect(data.order.customer_name).toBe(name)
    expect(data.order.customer_name).toHaveLength(name.length)
  })
})

describe('the address limit matches on both sides', () => {
  it(`accepts an address of exactly ${MIN_ADDRESS_LENGTH}`, async () => {
    const { error } = await placeOrder(anon, {
      fulfillmentType: 'delivery',
      address: 'x'.repeat(MIN_ADDRESS_LENGTH),
    })

    expect(error).toBeNull()
  })

  it(`rejects an address of ${MIN_ADDRESS_LENGTH - 1}`, async () => {
    const { error } = await placeOrder(anon, {
      fulfillmentType: 'delivery',
      address: 'x'.repeat(MIN_ADDRESS_LENGTH - 1),
    })

    expect(error?.message).toBe('invalid_address')
  })

  it(`accepts an address of exactly ${MAX_ADDRESS_LENGTH}`, async () => {
    const { error } = await placeOrder(anon, {
      fulfillmentType: 'delivery',
      address: 'x'.repeat(MAX_ADDRESS_LENGTH),
    })

    expect(error).toBeNull()
  })

  it(`rejects an address of ${MAX_ADDRESS_LENGTH + 1} rather than trimming it`, async () => {
    const { error } = await placeOrder(anon, {
      fulfillmentType: 'delivery',
      address: 'x'.repeat(MAX_ADDRESS_LENGTH + 1),
    })

    expect(error?.message).toBe('address_too_long')
  })

  it('the form catches an over-long address before the database has to', () => {
    const required = { required: true }
    expect(validateAddress('x'.repeat(MAX_ADDRESS_LENGTH), required)).toBeNull()
    expect(validateAddress('x'.repeat(MAX_ADDRESS_LENGTH + 1), required)).toBe('addressTooLong')
  })
})

describe('the notes limit matches on both sides', () => {
  it(`accepts notes of exactly ${MAX_NOTES_LENGTH}`, async () => {
    const { error } = await placeOrder(anon, { ...pickup, notes: 'x'.repeat(MAX_NOTES_LENGTH) })

    expect(error).toBeNull()
  })

  it(`rejects notes of ${MAX_NOTES_LENGTH + 1}`, async () => {
    const { error } = await placeOrder(anon, { ...pickup, notes: 'x'.repeat(MAX_NOTES_LENGTH + 1) })

    expect(error?.message).toBe('invalid_notes')
  })
})

describe('the per-line quantity cap matches the cart', () => {
  it(`accepts ${MAX_QUANTITY} of one item`, async () => {
    const { error } = await placeOrder(anon, pickup, [
      { size_id: FIXTURES.sizeMediumId, quantity: MAX_QUANTITY },
    ])

    expect(error).toBeNull()
  })

  it(`rejects ${MAX_QUANTITY + 1}`, async () => {
    // The cart cannot produce this, but the API is reachable without the cart.
    const { error } = await placeOrder(anon, pickup, [
      { size_id: FIXTURES.sizeMediumId, quantity: MAX_QUANTITY + 1 },
    ])

    expect(error?.message).toBe('item_unavailable')
  })
})

describe('phone normalisation is identical in the form and the database', () => {
  // Distinct numbers per case: place_order rate-limits by phone, and several of
  // these would otherwise collapse onto the same one.
  it.each([
    ['0331 4445566', '+923314445566'],
    ['03324445566', '+923324445566'],
    ['3334445566', '+923334445566'],
    ['+92 334 4445566', '+923344445566'],
    ['923354445566', '+923354445566'],
    ['0336-444-5566', '+923364445566'],
  ])('both turn %s into %s', async (typed, expected) => {
    expect(normalisePhone(typed), 'the form disagrees').toBe(expected)

    const { data, error } = await placeOrder(anon, { ...pickup, phone: typed })

    expect(error).toBeNull()
    expect(data.order.customer_phone, 'the database disagrees').toBe(expected)
  })

  it.each([
    ['an empty number', ''],
    ['one digit short', '030144455'],
    ['too many digits', '03014445566789'],
    ['a landline', '02014445566'],
    ['letters', 'notaphone'],
    ['a US number', '+15550100'],
  ])('both reject %s', async (_label, typed) => {
    expect(normalisePhone(typed), 'the form accepts it').toBeNull()

    const { error } = await placeOrder(anon, { ...pickup, phone: typed })

    expect(error?.message, 'the database accepts it').toBe('invalid_phone')
  })
})
