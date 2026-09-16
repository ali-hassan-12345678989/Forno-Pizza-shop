import { describe, it, expect } from 'vitest'
import {
  normalisePhone,
  toLocalPhone,
  validateName,
  validatePhone,
  validateAddress,
  validateNotes,
  validateCheckout,
  MAX_NOTES_LENGTH,
} from '../src/lib/validation.js'

// Pure rules, no network — unlike the RLS suites these run instantly and are
// the cheapest place to pin down checkout behaviour before it reaches the form.

describe('Pakistani phone numbers', () => {
  it.each([
    ['0300 1234567', '+923001234567'],
    ['03001234567', '+923001234567'],
    ['3001234567', '+923001234567'],
    ['+92 300 1234567', '+923001234567'],
    ['923001234567', '+923001234567'],
    ['0332-111-2222', '+923321112222'],
  ])('normalises %s', (input, expected) => {
    expect(normalisePhone(input)).toBe(expected)
  })

  it.each([
    ['', 'empty'],
    ['0300123456', 'one digit short'],
    ['030012345678', 'one digit long'],
    ['02001234567', 'does not start with 3 after the 0'],
    ['notaphone', 'letters'],
    ['+1 555 0100', 'a US number'],
  ])('rejects %s (%s)', (input) => {
    expect(normalisePhone(input)).toBeNull()
  })

  it('flags a missing number differently from a malformed one', () => {
    // The customer gets a different message for each, so these must not collapse.
    expect(validatePhone('')).toBe('phoneRequired')
    expect(validatePhone('12345')).toBe('phoneInvalid')
  })
})

describe('name', () => {
  it('requires something', () => {
    expect(validateName('')).toBe('nameRequired')
    expect(validateName('   ')).toBe('nameRequired')
  })

  it('rejects a single character', () => {
    expect(validateName('A')).toBe('nameTooShort')
  })

  it('accepts a normal name', () => {
    expect(validateName('Ayesha Khan')).toBeNull()
  })
})

describe('address', () => {
  it('is required for delivery', () => {
    expect(validateAddress('', { required: true })).toBe('addressRequired')
  })

  it('is skipped entirely for pickup', () => {
    // Pickup has no address, so an empty value must not block the order.
    expect(validateAddress('', { required: false })).toBeNull()
  })

  it('rejects a too-vague address', () => {
    expect(validateAddress('F-7', { required: true })).toBe('addressTooShort')
  })

  it('accepts a real one', () => {
    expect(validateAddress('House 12, Street 4, F-7/2', { required: true })).toBeNull()
  })
})

describe('notes', () => {
  it('are optional', () => {
    expect(validateNotes('')).toBeNull()
  })

  it('reject anything over the limit', () => {
    expect(validateNotes('x'.repeat(MAX_NOTES_LENGTH))).toBeNull()
    expect(validateNotes('x'.repeat(MAX_NOTES_LENGTH + 1))).toBe('notesTooLong')
  })
})

describe('the whole checkout form', () => {
  const valid = {
    name: 'Ayesha Khan',
    phone: '03001234567',
    address: 'House 12, Street 4, F-7/2',
    notes: '',
  }

  it('passes a complete delivery order', () => {
    expect(validateCheckout(valid, { requireAddress: true })).toEqual({})
  })

  it('passes a pickup order with no address', () => {
    expect(validateCheckout({ ...valid, address: '' }, { requireAddress: false })).toEqual({})
  })

  it('reports every bad field at once, not just the first', () => {
    // Showing one error at a time turns checkout into a guessing game.
    const errors = validateCheckout(
      { name: '', phone: 'abc', address: '', notes: '' },
      { requireAddress: true },
    )

    expect(Object.keys(errors).sort()).toEqual(['address', 'name', 'phone'])
  })

  it('does not invent an address error on a pickup order', () => {
    const errors = validateCheckout(
      { name: '', phone: '', address: '', notes: '' },
      { requireAddress: false },
    )

    expect(errors.address).toBeUndefined()
  })
})

describe('putting a stored number back into the form', () => {
  it.each(['0300 1234567', '03001234567', '3001234567', '+92 300 1234567'])(
    'round-trips %s without gaining a second country code',
    (typed) => {
      // The field renders a fixed "+92" prefix, so it must be handed the ten
      // national digits — not the E.164 form that was stored.
      const stored = normalisePhone(typed)
      const backInTheForm = toLocalPhone(stored)

      expect(backInTheForm).toBe('3001234567')
      expect(backInTheForm.startsWith('+')).toBe(false)
      // ...and what the form now holds still normalises to the same number.
      expect(normalisePhone(backInTheForm)).toBe(stored)
    },
  )

  it.each([null, undefined, '', 'nonsense', '+15550100'])(
    'returns an empty string for %s rather than junk',
    (value) => {
      expect(toLocalPhone(value)).toBe('')
    },
  )
})
