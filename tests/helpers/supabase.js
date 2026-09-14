import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

// Seeded by supabase/seed_test_data.sql.
export const FIXTURES = {
  menuItemId: '11111111-1111-1111-1111-111111111111',
  sizeMediumId: '22222222-2222-2222-2222-222222222222',
  sizeLargeId: '22222222-2222-2222-2222-333333333333',
  ingredientId: '33333333-3333-3333-3333-333333333333',
}

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
}

/** A browsing customer with no session at all — the guest case. */
export function anonClient() {
  return createClient(URL, ANON_KEY, clientOptions)
}

/**
 * Signs in one of the fixed test accounts, creating it on first ever run.
 * Reusing accounts keeps repeated test runs from filling auth.users with junk.
 */
export async function signedInClient(email) {
  const client = createClient(URL, ANON_KEY, clientOptions)
  const password = process.env.TEST_USER_PASSWORD

  let { data, error } = await client.auth.signInWithPassword({ email, password })

  if (error) {
    const created = await client.auth.signUp({ email, password })
    if (created.error) {
      throw new Error(`Could not sign in or create ${email}: ${created.error.message}`)
    }
    if (!created.data.session) {
      throw new Error(
        `${email} was created but no session was returned. Turn off ` +
          'Authentication -> Sign In / Providers -> Email -> "Confirm email".',
      )
    }
    data = created.data
  }

  return { client, userId: data.user.id }
}

/**
 * Builds a valid guest order payload. The client generates `id` and
 * `access_token` itself because guests have no SELECT policy on orders, so an
 * insert cannot return them — see the comment in supabase/schema.sql.
 */
export function newGuestOrder(overrides = {}) {
  return {
    id: randomUUID(),
    access_token: randomUUID(),
    customer_name: 'Integration Test',
    customer_phone: '03001234567',
    fulfillment_type: 'delivery',
    delivery_address: 'House 12, Street 4, F-7/2, Islamabad',
    subtotal: 14.0,
    delivery_fee: 2.5,
    tax: 1.32,
    total: 17.82,
    ...overrides,
  }
}

export function newOrderItem(orderId, overrides = {}) {
  return {
    order_id: orderId,
    menu_item_id: FIXTURES.menuItemId,
    menu_item_size_id: FIXTURES.sizeMediumId,
    item_name: 'Classic pepperoni',
    size_label: 'Medium',
    quantity: 1,
    unit_price: 14.0,
    line_total: 14.0,
    ...overrides,
  }
}

/**
 * A read is legitimately blocked two different ways: RLS returns an empty set,
 * while a missing GRANT raises 42501. Both mean "you cannot see this", so a
 * test asserting a lockout has to accept either.
 */
export function isReadDenied({ data, error }) {
  if (error) return error.code === '42501' || /permission denied/i.test(error.message)
  return Array.isArray(data) && data.length === 0
}

/** Postgres codes returned when a write is refused by RLS or by privileges. */
export function isWriteDenied(error) {
  if (!error) return false
  return (
    error.code === '42501' ||
    /row-level security|permission denied/i.test(error.message)
  )
}
