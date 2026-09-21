import { supabase } from '../supabaseClient'
import { isStaffRole } from '../config/staff'

/**
 * The caller's own role, straight from the database.
 *
 * staff_role() is SECURITY DEFINER and filters on auth.uid(), so this can only
 * ever describe the current session — there is no request shape that asks it
 * about somebody else. The browser is never trusted to remember the answer:
 * every gate calls this again rather than reading a cached flag, because a
 * cached flag is exactly what an attacker would edit.
 */
export async function fetchStaffRole() {
  const { data, error } = await supabase.rpc('staff_role')

  // anon has no EXECUTE on staff_role(), so a signed-out visitor gets a
  // privilege error rather than null. Both mean the same thing here: no role.
  if (error) return { role: null, error: error.message }

  return { role: isStaffRole(data) ? data : null, error: null }
}
