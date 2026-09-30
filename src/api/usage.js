import { supabase } from '../supabaseClient'

/** Codes staff_usage_between() can raise. */
const USAGE_ERRORS = {
  not_staff: 'not_staff',
  invalid_range: 'invalid_range',
  range_too_long: 'range_too_long',
}

function errorCodeFrom(error) {
  const raw = String(error?.message ?? '').trim()
  return USAGE_ERRORS[raw] ?? 'unknown'
}

/**
 * What each ingredient consumed over a window, and whether anybody checked.
 *
 * WHY A WINDOW AND NOT "ALL TIME". Usage is only worth anything when it can be
 * reconciled against a physical count, and a count covers a period — count the
 * shelf on Monday, count it again the following Monday, and the week between
 * them is a closed set of books. All-time can never be reconciled against
 * anything, because nobody has ever counted "all time".
 *
 * Nothing here nets, filters or buckets anything. staff_usage_between() already
 * separates deliveries from consumption, cancels a cancelled order out against
 * itself, and cuts both ends of the window in the shop's own time zone — the
 * same zone sales_report() uses, which is what lets the two screens be compared
 * at all. Repeating any of that in the browser would be a second opinion able
 * to disagree.
 *
 * `variance` is deliberately left null when nobody counted. Coercing it to zero
 * here would make an unchecked shelf indistinguishable from one that counted
 * clean, and those are opposite facts.
 */
export async function fetchUsageBetween(from, to) {
  const { data, error } = await supabase.rpc('staff_usage_between', {
    p_from: from,
    p_to: to,
  })

  if (error) return { rows: null, errorCode: errorCodeFrom(error) }

  return {
    rows: (data ?? []).map((row) => ({
      id: row.ingredient_id,
      name: row.name,
      unit: row.unit,
      used: Number(row.used),
      received: Number(row.received),
      stock: Number(row.stock_quantity),
      threshold: Number(row.low_stock_threshold),
      isLow: row.is_low,
      isOut: row.is_out,
      variance: row.variance === null || row.variance === undefined ? null : Number(row.variance),
      countsTaken: Number(row.counts_taken),
      lastCountedAt: row.last_counted_at,
    })),
    errorCode: null,
  }
}
