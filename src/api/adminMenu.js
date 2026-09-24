import { supabase } from '../supabaseClient'

/** Everything the menu functions can raise, mapped for the UI. */
const MENU_ERRORS = {
  not_admin: 'not_admin',
  name_required: 'name_required',
  name_too_long: 'name_too_long',
  description_too_long: 'description_too_long',
  category_too_long: 'category_too_long',
  badge_too_long: 'badge_too_long',
  item_not_found: 'item_not_found',
  item_has_orders: 'item_has_orders',
  item_required: 'item_required',
  size_required: 'size_required',
  size_too_long: 'size_too_long',
  size_not_found: 'size_not_found',
  size_has_orders: 'size_has_orders',
  size_already_exists: 'size_already_exists',
  invalid_price: 'invalid_price',
  price_too_large: 'price_too_large',
}

function errorCodeFrom(error) {
  const raw = String(error?.message ?? '').trim()
  return MENU_ERRORS[raw] ?? 'unknown'
}

/**
 * The whole menu as the Admin sees it — including items no customer can,
 * because inactive ones still need editing.
 *
 * Each row carries order_count so the UI knows whether an item can be deleted
 * or only retired, without offering a button that is certain to fail.
 */
export async function fetchAdminMenu() {
  const { data, error } = await supabase.rpc('admin_menu_items')

  if (error) return { items: null, errorCode: errorCodeFrom(error) }

  return {
    items: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      imageUrl: row.image_url ?? '',
      category: row.category ?? '',
      badge: row.badge ?? '',
      sortOrder: row.sort_order ?? 0,
      isActive: row.is_active,
      isSoldOut: row.is_sold_out,
      // Read-only: the inventory engine owns this one.
      outOfStock: row.out_of_stock,
      orderCount: Number(row.order_count),
      sizes: (row.sizes ?? []).map((s) => ({
        id: s.id,
        size: s.size,
        price: Number(s.price),
        serves: s.serves ?? '',
        sortOrder: s.sort_order ?? 0,
        orderCount: Number(s.order_count ?? 0),
      })),
    })),
    errorCode: null,
  }
}

/**
 * A brand-new item, before it has ever been saved.
 *
 * Hidden by default. An item is created with no sizes, and an active item with
 * no sizes is a card on the customer menu that cannot be ordered — so the Admin
 * adds the sizes first, then sets it live. Saving cannot publish something
 * broken by accident.
 *
 * A function rather than a constant: the editor holds this in state and would
 * otherwise share one object with every other new item the session opens.
 */
export function blankMenuItem() {
  return {
    id: null,
    name: '',
    description: '',
    imageUrl: '',
    category: '',
    badge: '',
    sortOrder: 0,
    isActive: false,
    isSoldOut: false,
    outOfStock: false,
    orderCount: 0,
    sizes: [],
  }
}

export async function saveMenuItem(item) {
  const { data, error } = await supabase.rpc('admin_save_menu_item', {
    p_id: item.id ?? null,
    p_name: item.name,
    p_description: item.description || null,
    p_image_url: item.imageUrl || null,
    p_category: item.category || null,
    p_badge: item.badge || null,
    p_sort_order: item.sortOrder ?? 0,
    p_is_active: item.isActive,
    p_is_sold_out: item.isSoldOut,
    // p_out_of_stock deliberately does not exist. refresh_sold_out() owns it.
  })

  if (error) return { id: null, errorCode: errorCodeFrom(error) }
  return { id: data, errorCode: null }
}

export async function deleteMenuItem(id) {
  const { error } = await supabase.rpc('admin_delete_menu_item', { p_id: id })
  return { errorCode: error ? errorCodeFrom(error) : null }
}

export async function saveMenuSize(size) {
  const { data, error } = await supabase.rpc('admin_save_menu_size', {
    p_id: size.id ?? null,
    p_menu_item_id: size.menuItemId ?? null,
    p_size: size.size,
    p_price: size.price,
    p_serves: size.serves || null,
    p_sort_order: size.sortOrder ?? 0,
  })

  if (error) return { id: null, errorCode: errorCodeFrom(error) }
  return { id: data, errorCode: null }
}

/**
 * Deleting a size takes its recipe with it — which ingredients it uses and how
 * much of each — and no screen in the panel can put that back.
 *
 * So the database refuses unless it is told, explicitly, that the caller knows.
 * `confirmRecipeLoss` is that word, and it is only ever true because the Admin
 * answered the dialog in MenuItemEditor. Passing it by default here would turn
 * the guard back into the cascade it replaced.
 */
export async function deleteMenuSize(id, { confirmRecipeLoss = false } = {}) {
  const { error } = await supabase.rpc('admin_delete_menu_size', {
    p_id: id,
    p_confirm_recipe_loss: confirmRecipeLoss,
  })
  return { errorCode: error ? errorCodeFrom(error) : null }
}
