/**
 * The tidying admin_save_menu_item() and admin_save_menu_size() already do.
 *
 * Both wrap every text column in `nullif(btrim(...), '')`, so a value typed
 * with a stray space is not the value that comes back. The editor decides
 * whether anything is unsaved by comparing what it holds against what the
 * database returned — so it has to hold the trimmed version, or a single
 * trailing space leaves "Unsaved changes" on screen for ever, with a save that
 * succeeds every time and changes nothing.
 *
 * Mirrored here rather than worked around, and applied before sending, so the
 * two ends agree on what was stored. The database remains the one that decides.
 */

const tidy = (value) => String(value ?? '').trim()

export function tidyItem(item) {
  return {
    ...item,
    name: tidy(item.name),
    description: tidy(item.description),
    imageUrl: tidy(item.imageUrl),
    category: tidy(item.category),
    badge: tidy(item.badge),
  }
}

export function tidySize(size) {
  return {
    ...size,
    size: tidy(size.size),
    serves: tidy(size.serves),
  }
}
