const UNSPLASH_BASE = 'https://images.unsplash.com'

/**
 * Menu photos live in menu_items.image_url in Supabase — the shop owner changes
 * them from the Admin panel, not from code. This builder only normalises the
 * sizing/quality params so every image is requested at the size it renders at.
 */
function unsplashUrl(photoId, { width = 600, quality = 72 } = {}) {
  return `${UNSPLASH_BASE}/${photoId}?w=${width}&q=${quality}&auto=format&fit=crop`
}

/**
 * Re-requests a stored Unsplash URL at the width we actually display, so a card
 * doesn't download a 2000px original. Any non-Unsplash URL passes through.
 */
export function sizedImage(url, { width = 600, quality = 72 } = {}) {
  if (!url) return null
  if (!url.startsWith(UNSPLASH_BASE)) return url
  const [base] = url.split('?')
  return `${base}?w=${width}&q=${quality}&auto=format&fit=crop`
}

export const IMAGES = {
  hero: unsplashUrl('photo-1574071318508-1cdbab80d002', { width: 900, quality: 75 }),
}

export const IMAGE_SIZES = {
  menuCard: { width: 600, quality: 72 },
  // The Admin's menu index shows the same photos at thumbnail size.
  adminThumb: { width: 120, quality: 60 },
}
