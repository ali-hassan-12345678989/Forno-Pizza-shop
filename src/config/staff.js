/**
 * The three staff roles.
 *
 * These strings are the contract with the database: they must match the check
 * constraint on public.staff.role and what staff_role() returns. A browser
 * cannot read a Postgres constraint, so the duplication is unavoidable — what
 * is avoidable is spelling them by hand at every call site, and having nothing
 * fail when one of them drifts. tests/staff-roles.test.js probes the real
 * database with these exact values, so a rename that misses one end is caught.
 */
export const STAFF_ROLES = {
  manager: 'manager',
  admin: 'admin',
  chef: 'chef',
}

/** Every valid role, for exhaustive checks. */
export const ALL_STAFF_ROLES = Object.values(STAFF_ROLES)

/** What staff_role() gives back for anyone who is not staff. */
export const NO_ROLE = null

export function isStaffRole(value) {
  return ALL_STAFF_ROLES.includes(value)
}
