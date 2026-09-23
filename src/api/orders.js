import { supabase } from '../supabaseClient'
import { ORDER_TYPES } from '../config/fulfillment'

/**
 * Placing and reading back an order.
 *
 * Both calls are Postgres functions rather than table queries, for the same
 * reason in both directions:
 *
 *  - place_order() prices the order from the database. This module deliberately
 *    sends no money at all — only size ids and quantities — because the totals
 *    shown in the cart are a preview, not the price. The client has no INSERT
 *    privilege on `orders`, so there is no second path to get this wrong.
 *  - get_order_by_token() is the only read a guest has. Holding the order id is
 *    not authorisation; holding the token is.
 */

/** Errors place_order() raises. Anything else is unexpected and reported as such. */
const ORDER_ERRORS = {
  invalid_fulfillment_type: 'invalid_fulfillment_type',
  invalid_name: 'invalid_name',
  invalid_phone: 'invalid_phone',
  invalid_address: 'invalid_address',
  invalid_notes: 'invalid_notes',
  empty_cart: 'empty_cart',
  too_many_lines: 'too_many_lines',
  item_unavailable: 'item_unavailable',
  rate_limited: 'rate_limited',
  settings_missing: 'settings_missing',
  // deduct_order_stock(), reached through place_order()
  out_of_stock: 'out_of_stock',
  recipe_missing: 'recipe_missing',
  ingredient_missing: 'ingredient_missing',
  // cancel_order()
  order_not_found: 'order_not_found',
  already_cancelled: 'already_cancelled',
  cancel_window_closed: 'cancel_window_closed',
}

/** Thrown with a `code` the checkout form can map to a message. */
export class OrderError extends Error {
  constructor(code, cause) {
    super(code)
    this.name = 'OrderError'
    this.code = code
    this.cause = cause
  }
}

function errorCodeFrom(error) {
  // Postgres puts the raise message straight into `message`; a network or
  // platform failure will not match any of our codes.
  const raw = String(error?.message ?? '').trim()
  return ORDER_ERRORS[raw] ?? 'unknown'
}

/**
 * Creates the order. Returns the placed order plus the access token, which is
 * handed over exactly once — every later read has it stripped out.
 *
 * @param {object} details  name, phone, address, notes, fulfillmentType
 * @param {Array}  lines    cart lines; only sizeId and quantity are sent
 */
export async function placeOrder(details, lines) {
  const { data, error } = await supabase.rpc('place_order', {
    p_fulfillment_type: details.fulfillmentType,
    p_customer_name: details.name,
    p_customer_phone: details.phone,
    p_delivery_address: details.address ?? null,
    p_delivery_notes: details.notes ?? null,
    // Ids and counts only. No price of any kind leaves the browser — the
    // extras are priced by place_order() from the toppings table.
    p_items: lines.map((line) => ({
      size_id: line.sizeId,
      quantity: line.quantity,
      topping_ids: (line.toppings ?? []).map((topping) => topping.id),
    })),
  })

  if (error) throw new OrderError(errorCodeFrom(error), error)
  if (!data) throw new OrderError('unknown')

  return { accessToken: data.access_token, ...normaliseOrder(data) }
}

/** Reads an order back from its tracking token. Returns null if no such token. */
export async function fetchOrderByToken(token) {
  const { data, error } = await supabase.rpc('get_order_by_token', { p_access_token: token })

  if (error) throw new OrderError(errorCodeFrom(error), error)
  if (!data) return null

  return normaliseOrder(data)
}

/**
 * FR-3.3: the customer calling their own order off.
 *
 * The token is the credential here for the same reason it is on the way in —
 * an order id is not proof of anything. The window (before the kitchen starts)
 * is enforced inside cancel_order(), not here: a check in the browser decides
 * what to show, never what is allowed.
 *
 * Returns the cancelled order in the same shape as every other read, so the
 * tracking page re-renders from the result instead of fetching again.
 */
export async function cancelOrder(token) {
  const { data, error } = await supabase.rpc('cancel_order', { p_access_token: token })

  if (error) throw new OrderError(errorCodeFrom(error), error)
  if (!data) throw new OrderError('unknown')

  return normaliseOrder(data)
}

/**
 * Every order belonging to the signed-in customer, newest first.
 *
 * There is no `.eq('user_id', ...)` here on purpose. The orders_select_own
 * policy already scopes this to auth.uid(), and adding a second filter in the
 * browser would hide a broken policy behind a query that happens to look right.
 * account-isolation.test.js is what proves the database is doing the scoping.
 *
 * Guest orders are not listed — they have no user_id to match. Customers reach
 * those through their tracking link instead.
 */
export async function fetchMyOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false })

  if (error) throw new OrderError(errorCodeFrom(error), error)

  return (data ?? []).map(normaliseHistoryRow)
}

/**
 * The details this customer last ordered with, for prefilling checkout.
 *
 * Scoped by the orders_select_own policy exactly like fetchMyOrders, so a guest
 * gets nothing and one customer can never be prefilled with another's address.
 * Returns null when there is no previous order to draw on.
 */
export async function fetchSavedDetails() {
  const { data, error } = await supabase
    .from('orders')
    .select('customer_name, customer_phone, delivery_address')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  return {
    name: data.customer_name ?? '',
    phone: data.customer_phone ?? '',
    address: data.delivery_address ?? '',
  }
}

function normaliseHistoryRow(row) {
  const { order_items: items, ...order } = row

  return {
    ...normaliseOrder({
      order,
      items: [...(items ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
      status_history: [],
    }),
    // The customer's own tracking credential, so history can link straight to
    // the order view without a second lookup.
    accessToken: order.access_token,
  }
}

/**
 * One shape for every order view, so no two of them can disagree.
 *
 * Exported because the Admin's reader (api/adminOrders.js) returns the same
 * order/items/status_history payload as get_order_by_token() and has no business
 * inventing a second mapping of the same columns.
 */
export function normaliseOrder(payload) {
  const order = payload.order ?? {}

  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    /* Both forms, deliberately. isDelivery is the question almost every screen
       actually asks; fulfillmentType is what the status ladder is keyed by, and
       deriving it back from a boolean would invent a value the database never
       sent. */
    fulfillmentType: order.fulfillment_type,
    isDelivery: order.fulfillment_type === ORDER_TYPES.delivery,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    address: order.delivery_address ?? null,
    notes: order.delivery_notes ?? null,
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.delivery_fee),
    total: Number(order.total),
    placedAt: order.created_at,
    items: (payload.items ?? []).map((item) => ({
      id: item.id,
      /* The line's own id is unique per line; this is the dish behind it. Two
         Larges and a Medium of the same pizza are three lines but one thing to
         have an opinion about, which is what the review panel keys on. */
      menuItemId: item.menu_item_id,
      name: item.item_name,
      sizeLabel: item.size_label,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
      toppings: (item.toppings ?? []).map((topping) => ({
        id: topping.id,
        name: topping.name,
        price: Number(topping.price),
      })),
    })),
    statusHistory: (payload.status_history ?? []).map((entry) => ({
      status: entry.status,
      at: entry.created_at,
    })),
  }
}
