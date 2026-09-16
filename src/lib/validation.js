/**
 * Checkout field rules. Kept separate from the form so the same rules can be
 * unit-tested and reused, and so error wording lives in content/copy.js rather
 * than being spelled out here.
 *
 * Each validator returns an error KEY or null. The form maps keys to messages.
 */

/**
 * These limits are stated twice: here, and again in place_order() in
 * supabase/place_order.sql. That duplication is unavoidable — the browser and
 * Postgres cannot share a constant — but it is not left to trust:
 * tests/validation-parity.test.js probes the database at each boundary using
 * the values below, so the two drifting apart fails the suite.
 */
export const MIN_NAME_LENGTH = 2
export const MIN_ADDRESS_LENGTH = 8
export const MAX_NOTES_LENGTH = 200

/**
 * Pakistani mobile numbers are 10 digits starting with 3, written locally with
 * a leading 0 (0300 1234567) and internationally as +92 300 1234567. Accept
 * either and normalise, the way Domino's PK and Pizza Hut PK both do.
 */
export function normalisePhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')

  if (/^923\d{9}$/.test(digits)) return `+${digits}`
  if (/^03\d{9}$/.test(digits)) return `+92${digits.slice(1)}`
  if (/^3\d{9}$/.test(digits)) return `+92${digits}`

  return null
}

/**
 * The inverse of normalisePhone, for putting a stored number back into the
 * form. The field renders a fixed "+92" prefix, so it wants the ten national
 * digits — handing it the full +923001234567 would read as +92 +923001234567.
 */
export function toLocalPhone(e164) {
  const digits = String(e164 ?? '').replace(/\D/g, '')
  return /^923\d{9}$/.test(digits) ? digits.slice(2) : ''
}

export function validateName(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return 'nameRequired'
  if (trimmed.length < MIN_NAME_LENGTH) return 'nameTooShort'
  return null
}

export function validatePhone(value) {
  if (!String(value ?? '').trim()) return 'phoneRequired'
  if (!normalisePhone(value)) return 'phoneInvalid'
  return null
}

export function validateAddress(value, { required }) {
  if (!required) return null
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return 'addressRequired'
  if (trimmed.length < MIN_ADDRESS_LENGTH) return 'addressTooShort'
  return null
}

export function validateNotes(value) {
  if (String(value ?? '').length > MAX_NOTES_LENGTH) return 'notesTooLong'
  return null
}

export function validateEmail(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return 'emailRequired'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'emailInvalid'
  return null
}

export function validatePassword(value) {
  if (!value) return 'passwordRequired'
  if (String(value).length < 8) return 'passwordTooShort'
  return null
}

/** Returns { field: errorKey } for every invalid field; empty object when valid. */
export function validateCheckout({ name, phone, address, notes }, { requireAddress }) {
  const errors = {}

  const nameError = validateName(name)
  if (nameError) errors.name = nameError

  const phoneError = validatePhone(phone)
  if (phoneError) errors.phone = phoneError

  const addressError = validateAddress(address, { required: requireAddress })
  if (addressError) errors.address = addressError

  const notesError = validateNotes(notes)
  if (notesError) errors.notes = notesError

  return errors
}
