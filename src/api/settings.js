import { supabase } from '../supabaseClient'
import { SETTINGS_TIMEOUT_MS } from '../config/network'

/**
 * The shop's own details. One row, enforced by a check constraint.
 *
 * Bounded by its own clock rather than left to supabase-js's retry schedule.
 * `.abortSignal` is passed to PostgREST, so a timeout cancels the request in
 * flight instead of leaving it running behind an error screen the customer has
 * already been shown.
 */
export async function fetchShopSettings() {
  const { data, error } = await supabase
    .from('shop_settings')
    .select('*')
    .abortSignal(AbortSignal.timeout(SETTINGS_TIMEOUT_MS))
    .single()

  if (error) throw error

  return {
    name: data.name,
    tagline: data.tagline,
    phone: data.phone_display,
    phoneHref: `tel:${data.phone_e164}`,
    address: data.address,
    hours: data.hours,
    deliveryEta: data.delivery_eta,
    pickupEta: data.pickup_eta,
    deliveryFee: Number(data.delivery_fee),
  }
}
