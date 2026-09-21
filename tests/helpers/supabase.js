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
      // "User already registered" here means sign-in failed for some reason
      // OTHER than the account not existing - almost always Supabase's auth
      // rate limit. Reporting only the signUp error sends you hunting for a
      // missing account that is right there, so carry both.
      throw new Error(
        `Could not sign in as ${email}. Sign-in said: ${error.message}. ` +
          `Sign-up then said: ${created.error.message}.`,
      )
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
 * The two staff accounts. Their addresses live in .env; their ROLES are
 * granted by supabase/seed_staff.sql, which has to name the same addresses.
 * Nothing in the test suite can grant a role itself - that is the point of
 * the staff table being unreachable from any client.
 */
/**
 * Read lazily, NOT captured at import time. tests/setup.js imports this module
 * before it calls dotenv.config(), and ES imports are hoisted above statements,
 * so anything read at the top level here sees an empty process.env. (The VITE_*
 * pair above survive only because Vite loads those itself.)
 */
export const STAFF = {
  get managerEmail() {
    return process.env.TEST_MANAGER_EMAIL
  },
  get adminEmail() {
    return process.env.TEST_ADMIN_EMAIL
  },
}

/** False when .env has no staff addresses yet, so those tests can say why they skipped. */
export function staffConfigured() {
  return Boolean(STAFF.managerEmail && STAFF.adminEmail)
}

/**
 * One session per staff account, reused.
 *
 * Supabase rate-limits authentication, and signing in once per `it()` was
 * enough to trip it: sign-in then fails, signedInClient falls back to signUp,
 * and the suite reports "User already registered" for accounts that exist. The
 * accounts are fixed and read-only here, so a shared session is both correct
 * and a great deal kinder to the auth endpoint.
 */
const staffSessions = new Map()

function cachedStaffClient(email) {
  if (!email)
    throw new Error('No staff email configured - see TEST_MANAGER_EMAIL / TEST_ADMIN_EMAIL')
  if (!staffSessions.has(email)) staffSessions.set(email, signedInClient(email))
  return staffSessions.get(email)
}

export function managerClient() {
  return cachedStaffClient(STAFF.managerEmail)
}

export function adminClient() {
  return cachedStaffClient(STAFF.adminEmail)
}

/**
 * A distinct valid Pakistani mobile per call.
 *
 * place_order() rate-limits by phone number, so tests that shared one would
 * start failing each other once the suite ran twice inside two minutes.
 */
export function randomPhone() {
  let digits = ''
  for (let i = 0; i < 9; i += 1) digits += Math.floor(Math.random() * 10)
  return `03${digits}`
}

/** A valid checkout payload. Note there is no price in it — there cannot be. */
export function newOrderDetails(overrides = {}) {
  return {
    fulfillmentType: 'delivery',
    name: 'Integration Test',
    phone: randomPhone(),
    address: 'House 12, Street 4, F-7/2, Islamabad',
    notes: null,
    ...overrides,
  }
}

/** One line of the fixture pizza, Medium. */
export function newItems(overrides = {}) {
  return [{ size_id: FIXTURES.sizeMediumId, quantity: 1, ...overrides }]
}

/**
 * Every order this test file placed, with the token needed to call it off
 * again. See releasePlacedOrders() for why that matters.
 */
const placed = []

/** Calls place_order and hands back the raw result, so failures can be asserted. */
export async function placeOrder(client, details = {}, items = newItems()) {
  const full = newOrderDetails(details)

  const result = await client.rpc('place_order', {
    p_fulfillment_type: full.fulfillmentType,
    p_customer_name: full.name,
    p_customer_phone: full.phone,
    p_delivery_address: full.address,
    p_delivery_notes: full.notes,
    p_items: items,
  })

  if (result.data?.access_token) {
    placed.push({ client, token: result.data.access_token })
  }

  return result
}

/**
 * Gives back everything this file's orders took out of stock.
 *
 * Since Part 3 task 4 an order is not just a row — it draws real ingredients
 * out of `ingredients`, and a test order is indistinguishable from a real one
 * as far as the engine is concerned. That is correct, and it is also why the
 * suite cannot simply leave its orders lying around: roughly a hundred orders a
 * run, at 250g of dough for a Medium, is 26kg of the 40kg the shop stocks. Two
 * runs and every pizza on the menu refuses to be ordered.
 *
 * Cancelling is the honest way to undo it. cancel_order() is the customer's own
 * action, it is reachable with the anon key the suite already uses, and it
 * restores stock through exactly the path a real cancellation takes — so the
 * clean-up exercises the refund rather than working around it.
 *
 * Errors are ignored on purpose: an order a test already cancelled comes back
 * 'already_cancelled', which is a success as far as this is concerned.
 */
export async function releasePlacedOrders() {
  const pending = placed.splice(0)

  await Promise.all(
    pending.map(({ client, token }) => client.rpc('cancel_order', { p_access_token: token })),
  )
}

/** Places an order that is expected to succeed, and returns it. */
export async function placeOrderOrThrow(client, details = {}, items = newItems()) {
  const { data, error } = await placeOrder(client, details, items)
  if (error) throw new Error(`place_order failed: ${error.message}`)
  return data
}

/**
 * Part 1 shapes, kept only so the tests that prove the direct-insert path is
 * CLOSED have something realistic to try. Nothing should expect these to work.
 */
export function newGuestOrder(overrides = {}) {
  return {
    id: randomUUID(),
    access_token: randomUUID(),
    customer_name: 'Integration Test',
    customer_phone: randomPhone(),
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

/** The extras this item actually offers, read at test time rather than pinned. */
export async function toppingsFor(client, menuItemId) {
  const { data } = await client
    .from('menu_item_toppings')
    .select('toppings(id, name, price)')
    .eq('menu_item_id', menuItemId)

  return (data ?? [])
    .map((row) => row.toppings)
    .filter(Boolean)
    .map((t) => ({ ...t, price: Number(t.price) }))
}

/** An item in a category that deliberately offers no extras (burgers, sides). */
export async function itemWithoutToppings(client) {
  const { data } = await client
    .from('menu_items')
    .select('id, name, category, menu_item_sizes(id)')
    .in('category', ['Burgers', 'Sides'])
    .limit(1)

  return data?.[0] ?? null
}

/** Looks up a genuinely sold-out size rather than pinning one by id, which the
 *  Manager panel in Part 4 will be able to change at any time. */
export async function findSoldOutSizeId(client) {
  // Either flag makes a dish unorderable: is_sold_out is the shop's own
  // decision, out_of_stock is the inventory engine's. Before Part 3 only the
  // first existed, and it was permanently set on one seeded pizza — which is
  // what this used to find. That flag is gone now (a shop does not refuse to
  // make a pizza it has the ingredients for), so on a healthy menu this
  // correctly returns null and the callers say so rather than pretending.
  const { data } = await client
    .from('menu_items')
    .select('id, is_sold_out, out_of_stock, menu_item_sizes(id)')
    .or('is_sold_out.eq.true,out_of_stock.eq.true')
    .limit(1)

  return data?.[0]?.menu_item_sizes?.[0]?.id ?? null
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
  return error.code === '42501' || /row-level security|permission denied/i.test(error.message)
}
