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
    /* The ordering window, so the customer can be told the shop is shut before
       they build a cart rather than after they press the button. The database
       still decides — shop_is_open() and a trigger on the orders table — but
       being refused at the last step is a bad way to learn a shop is closed.

       Defaulted here rather than assumed present, so the app keeps working
       against a database where supabase/opening_hours.sql has not been run:
       equal times mean open around the clock, which is the behaviour before
       any of this existed. */
    opensAt: data.opens_at ?? '00:00',
    closesAt: data.closes_at ?? '00:00',
    acceptsOrders: data.accepts_orders ?? true,
  }
}
