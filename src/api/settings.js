import { supabase } from '../supabaseClient'

/** The shop's own details. One row, enforced by a check constraint. */
export async function fetchShopSettings() {
  const { data, error } = await supabase.from('shop_settings').select('*').single()

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
