import { supabase } from '../supabaseClient'
import { MIX_DAYS, TIMING_DAYS } from '../config/adminInsights'

/** Codes the admin insight functions can raise, mapped for the UI. */
const ADMIN_ERRORS = {
  not_admin: 'not_admin',
  not_staff: 'not_staff',
  invalid_range: 'invalid_range',
  range_too_long: 'range_too_long',
  invalid_cost: 'invalid_cost',
  invalid_day: 'invalid_day',
  invalid_target: 'invalid_target',
  invalid_quantity: 'invalid_quantity',
  ingredient_not_found: 'ingredient_not_found',
  size_not_found: 'size_not_found',
  recipe_line_not_found: 'recipe_line_not_found',
  would_break_ordering: 'would_break_ordering',
}

function errorCodeFrom(error) {
  const raw = String(error?.message ?? '').trim()
  return ADMIN_ERRORS[raw] ?? 'unknown'
}

/**
 * A cost that may not be set.
 *
 * Null stays null all the way through. Coercing it to zero here would be the
 * single most damaging line in this file: every unpriced ingredient would read
 * as free, every margin would read as pure profit, and the figures would be
 * confidently wrong rather than honestly incomplete.
 */
const maybeNumber = (value) => (value === null || value === undefined ? null : Number(value))

/** What the shelves are worth, ingredient by ingredient. */
export async function fetchInventoryValue() {
  const { data, error } = await supabase.rpc('admin_inventory_value')

  if (error) return { rows: null, errorCode: errorCodeFrom(error) }

  return {
    rows: (data ?? []).map((row) => ({
      id: row.ingredient_id,
      name: row.name,
      unit: row.unit,
      stock: Number(row.stock_quantity),
      cost: maybeNumber(row.cost_per_unit),
      value: maybeNumber(row.value),
    })),
    errorCode: null,
  }
}

/** Sets or clears one ingredient's cost. Null clears it. */
export async function setIngredientCost(ingredientId, cost) {
  const { data, error } = await supabase.rpc('admin_set_ingredient_cost', {
    p_ingredient_id: ingredientId,
    p_cost: cost,
  })

  if (error) return { result: null, errorCode: errorCodeFrom(error) }
  return {
    result: { id: data?.ingredient_id, name: data?.name, cost: maybeNumber(data?.cost) },
    errorCode: null,
  }
}

/**
 * Price, food cost and margin for every sellable size.
 *
 * `missingCosts` is the column that matters. A size with one unpriced
 * ingredient has an unknown cost, not a smaller one, and the screen must refuse
 * to draw a margin for it rather than quietly reporting the cost of the
 * ingredients that happen to be priced.
 */
export async function fetchMenuCosts() {
  const { data, error } = await supabase.rpc('admin_menu_costs')

  if (error) return { rows: null, errorCode: errorCodeFrom(error) }

  return {
    rows: (data ?? []).map((row) => ({
      menuItemId: row.menu_item_id,
      itemName: row.item_name,
      sizeId: row.size_id,
      sizeLabel: row.size_label,
      price: Number(row.price),
      foodCost: maybeNumber(row.food_cost),
      margin: maybeNumber(row.margin),
      marginPercent: maybeNumber(row.margin_percent),
      recipeLines: Number(row.ingredients_in_recipe),
      missingCosts: Number(row.missing_costs),
      isActive: row.is_active,
    })),
    errorCode: null,
  }
}

/** Food cost across a window, with the leak found by counting beside it. */
export async function fetchCogs(from, to) {
  const { data, error } = await supabase.rpc('admin_cogs', { p_from: from, p_to: to })

  if (error) return { cogs: null, errorCode: errorCodeFrom(error) }

  const row = (data ?? [])[0]
  if (!row) return { cogs: null, errorCode: 'unknown' }

  return {
    cogs: {
      goodsRevenue: Number(row.goods_revenue),
      theoreticalCost: Number(row.theoretical_cost),
      varianceCost: Number(row.variance_cost),
      actualCost: Number(row.actual_cost),
      pricedIngredients: Number(row.priced_ingredients),
      totalIngredients: Number(row.total_ingredients),
      movementsPriced: Number(row.movements_priced),
      movementsTotal: Number(row.movements_total),
    },
    errorCode: null,
  }
}

/** Volume and margin per item. The four-way split happens in lib/productMix.js. */
export async function fetchProductMix(days = MIX_DAYS) {
  const { data, error } = await supabase.rpc('admin_product_mix', { p_days: days })

  if (error) return { rows: null, errorCode: errorCodeFrom(error) }

  return {
    rows: (data ?? []).map((row) => ({
      id: row.menu_item_id,
      name: row.item_name,
      quantity: Number(row.qty_sold),
      revenue: Number(row.revenue),
      foodCost: maybeNumber(row.food_cost),
      margin: maybeNumber(row.margin),
      costsKnown: Boolean(row.costs_known),
    })),
    errorCode: null,
  }
}

/** How long each stage of an order actually takes. */
export async function fetchFulfillmentTimes(days = TIMING_DAYS) {
  const { data, error } = await supabase.rpc('admin_fulfillment_times', { p_days: days })

  if (error) return { rows: null, errorCode: errorCodeFrom(error) }

  return {
    rows: (data ?? []).map((row) => ({
      stage: row.stage,
      order: Number(row.sort_order),
      ordersTimed: Number(row.orders_timed),
      medianSeconds: maybeNumber(row.median_seconds),
      meanSeconds: maybeNumber(row.mean_seconds),
      worstSeconds: maybeNumber(row.worst_seconds),
    })),
    errorCode: null,
  }
}

/** The seven weekday targets. A missing target comes back as null, not zero. */
export async function fetchSalesTargets() {
  const { data, error } = await supabase.rpc('admin_sales_targets')

  if (error) return { rows: null, errorCode: errorCodeFrom(error) }

  return {
    rows: (data ?? []).map((row) => ({
      dayOfWeek: Number(row.day_of_week),
      target: maybeNumber(row.target_revenue),
      updatedAt: row.updated_at,
    })),
    errorCode: null,
  }
}

/** Sets one weekday's target. Null clears it. */
export async function setSalesTarget(dayOfWeek, target) {
  const { error } = await supabase.rpc('admin_set_sales_target', {
    p_day_of_week: dayOfWeek,
    p_target: target,
  })

  return { errorCode: error ? errorCodeFrom(error) : null }
}

/** The bill of materials behind one sellable size. */
export async function fetchRecipeForSize(sizeId) {
  const { data, error } = await supabase.rpc('admin_recipe_for_size', { p_size_id: sizeId })

  if (error) return { rows: null, errorCode: errorCodeFrom(error) }

  return {
    rows: (data ?? []).map((row) => ({
      ingredientId: row.ingredient_id,
      name: row.name,
      unit: row.unit,
      quantity: Number(row.quantity),
      cost: maybeNumber(row.cost_per_unit),
      lineCost: maybeNumber(row.line_cost),
      stock: Number(row.stock_quantity),
    })),
    errorCode: null,
  }
}

/** Adds an ingredient to a recipe, or changes how much of it goes on. */
export async function saveRecipeLine(sizeId, ingredientId, quantity) {
  const { error } = await supabase.rpc('admin_save_recipe_line', {
    p_size_id: sizeId,
    p_ingredient_id: ingredientId,
    p_quantity: quantity,
  })

  return { errorCode: error ? errorCodeFrom(error) : null }
}

/**
 * Takes an ingredient off a recipe.
 *
 * The database refuses to empty the recipe of a size that is live on the menu —
 * that would take the pizza off sale silently, leaving it listed, addable to a
 * cart, and failing at the last step of checkout. `would_break_ordering` is
 * that refusal, and the screen explains it rather than reporting a failure.
 */
export async function deleteRecipeLine(sizeId, ingredientId) {
  const { error } = await supabase.rpc('admin_delete_recipe_line', {
    p_size_id: sizeId,
    p_ingredient_id: ingredientId,
  })

  return { errorCode: error ? errorCodeFrom(error) : null }
}
