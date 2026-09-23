import { supabase } from '../supabaseClient'

/** Codes staff_ingredient_usage() can raise. */
const USAGE_ERRORS = { not_staff: 'not_staff' }

function errorCodeFrom(error) {
  const raw = String(error?.message ?? '').trim()
  return USAGE_ERRORS[raw] ?? 'unknown'
}

/**
 * What each ingredient has consumed today and in total (Manager and Admin).
 *
 * Both figures arrive on the same row from one call, so the two windows on the
 * screen can never show two different moments.
 *
 * Nothing here nets, filters or buckets anything. staff_ingredient_usage()
 * already excludes deliveries, cancels a cancelled order out against itself,
 * and cuts the day in the shop's own time zone — the same zone sales_report()
 * uses, which is what lets the two screens be compared at all. Repeating any of
 * that in the browser would be a second opinion able to disagree.
 */
export async function fetchIngredientUsage() {
  const { data, error } = await supabase.rpc('staff_ingredient_usage')

  if (error) return { rows: null, errorCode: errorCodeFrom(error) }

  return {
    rows: (data ?? []).map((row) => ({
      id: row.ingredient_id,
      name: row.name,
      unit: row.unit,
      usedToday: Number(row.used_today),
      usedTotal: Number(row.used_total),
      stock: Number(row.stock_quantity),
      threshold: Number(row.low_stock_threshold),
      isLow: row.is_low,
      isOut: row.is_out,
    })),
    errorCode: null,
  }
}
