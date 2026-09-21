import { supabase } from '../supabaseClient'

/** Codes the inventory functions can raise, mapped for the UI. */
const INVENTORY_ERRORS = {
  not_staff: 'not_staff',
  not_manager: 'not_manager',
  invalid_quantity: 'invalid_quantity',
  quantity_too_large: 'quantity_too_large',
  ingredient_not_found: 'ingredient_not_found',
}

function errorCodeFrom(error) {
  const raw = String(error?.message ?? '').trim()
  return INVENTORY_ERRORS[raw] ?? 'unknown'
}

/**
 * Current stock for every ingredient (FR-6.3, FR-7.5).
 *
 * The ordering, the low-stock flag and the refusal all come from the database.
 * Nothing here recomputes "is this low" from a threshold the browser was
 * handed — that would be a second opinion able to disagree with the one that
 * actually fires the alerts.
 */
export async function fetchStockLevels() {
  const { data, error } = await supabase.rpc('staff_ingredients')

  if (error) return { rows: null, errorCode: errorCodeFrom(error) }

  return {
    rows: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      unit: row.unit,
      stock: Number(row.stock_quantity),
      threshold: Number(row.low_stock_threshold),
      isLow: row.is_low,
      isOut: row.is_out,
    })),
    errorCode: null,
  }
}

/**
 * Books in a delivery (FR-6.2). Manager only — the database refuses the Admin,
 * which is FR-7.6, and it refuses them whether or not this screen was shown.
 *
 * The quantity is sent as-is and ADDED server-side. The browser never computes
 * a new total: doing so would race every customer order placed in the seconds
 * the Manager spent typing.
 */
export async function receiveStock(ingredientId, quantity) {
  const { data, error } = await supabase.rpc('receive_stock', {
    p_ingredient_id: ingredientId,
    p_quantity: quantity,
  })

  if (error) return { row: null, errorCode: errorCodeFrom(error) }

  const row = (data ?? [])[0]
  if (!row) return { row: null, errorCode: 'unknown' }

  return {
    row: {
      id: row.id,
      name: row.name,
      unit: row.unit,
      stock: Number(row.stock_quantity),
      threshold: Number(row.low_stock_threshold),
      isLow: row.is_low,
      isOut: row.is_out,
    },
    errorCode: null,
  }
}

/**
 * Open low-stock alerts (FR-5.4).
 *
 * Only unresolved ones come back — note_stock_level() closes an alert when a
 * delivery lifts the ingredient back above its threshold, so this list empties
 * itself. Nothing here filters by date or recomputes "is it still low": the
 * database owns both, and a second opinion could disagree with the one that
 * actually raised the alert.
 */
export async function fetchStockAlerts() {
  const { data, error } = await supabase.rpc('staff_stock_alerts')

  if (error) return { alerts: null, errorCode: errorCodeFrom(error) }

  return {
    alerts: (data ?? []).map((row) => ({
      id: row.id,
      ingredientId: row.ingredient_id,
      name: row.ingredient_name,
      unit: row.unit,
      stockAtTrigger: Number(row.stock_at_trigger),
      currentStock: Number(row.current_stock),
      threshold: Number(row.low_stock_threshold),
      triggeredAt: row.triggered_at,
      stillBelow: row.still_below,
    })),
    errorCode: null,
  }
}
