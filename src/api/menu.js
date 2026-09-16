import { supabase } from '../supabaseClient'

/**
 * Loads the customer-facing menu.
 *
 * RLS already restricts this to active items, so there is no is_active filter
 * here — the database decides what a guest may see, not the browser.
 *
 * Selects `*` rather than naming columns so the page keeps working whether or
 * not the optional category/sort_order columns have been added yet.
 */
export async function fetchMenu() {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*, menu_item_sizes(*), menu_item_toppings(toppings(*))')

  if (error) throw error

  return (data ?? []).map(normaliseItem).sort(byDisplayOrder)
}

function normaliseItem(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    imageUrl: row.image_url ?? null,
    isSoldOut: Boolean(row.is_sold_out),
    category: row.category ?? null,
    badge: row.badge ?? null,
    sortOrder: row.sort_order ?? 0,
    sizes: (row.menu_item_sizes ?? [])
      .map((size) => ({
        id: size.id,
        label: size.size,
        price: Number(size.price),
        // "Serves 3-4" is what makes a Large feel worth the difference.
        serves: size.serves ?? null,
        sortOrder: size.sort_order ?? 0,
      }))
      .sort(byDisplayOrder),
    // Burgers and sides have none, which is how the modal knows not to offer
    // an extras step at all rather than showing an empty one.
    toppings: (row.menu_item_toppings ?? [])
      .map((link) => link.toppings)
      .filter(Boolean)
      .map((topping) => ({
        id: topping.id,
        name: topping.name,
        price: Number(topping.price),
        sortOrder: topping.sort_order ?? 0,
      }))
      .sort(byDisplayOrder),
  }
}

function byDisplayOrder(a, b) {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  return (a.name ?? a.label).localeCompare(b.name ?? b.label)
}

/** Distinct categories in display order, for the filter chips. */
export function categoriesOf(items) {
  const seen = []
  for (const item of items) {
    if (item.category && !seen.includes(item.category)) seen.push(item.category)
  }
  return seen
}
