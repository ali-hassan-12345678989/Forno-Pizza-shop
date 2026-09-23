import { describe, expect, it } from 'vitest'

import { ALL_STAFF_ROLES, STAFF_ROLES, isStaffRole } from '../src/config/staff.js'
import {
  STAFF,
  adminClient,
  anonClient,
  managerClient,
  signedInClient,
  chefClient,
  chefConfigured,
  staffConfigured,
} from './helpers/supabase.js'

const customerEmail = process.env.TEST_USER_A_EMAIL

/**
 * Postgres refuses with 42501 when a role lacks the privilege. A table or
 * function that does not EXIST also comes back as an error, so asserting
 * merely that "something failed" would pass against an empty database and
 * prove nothing. Every refusal below is pinned to the code that means
 * "it is there, and you may not touch it".
 */
const PERMISSION_DENIED = '42501'

function expectDenied(error, what) {
  expect(error, `${what}: expected a refusal, got none`).toBeTruthy()
  expect(
    error.code,
    `${what}: refused with ${error.code} (${error.message}) instead of ` +
      `${PERMISSION_DENIED}. A missing table or function errors too, which ` +
      'would make this assertion vacuous.',
  ).toBe(PERMISSION_DENIED)
}

/**
 * Part 4 rests entirely on the database knowing who is staff. If a customer
 * can read public.staff they learn the shop's account addresses; if they can
 * write it they become the Manager. Neither is recoverable by anything the UI
 * does, so both are proven here rather than assumed.
 */
describe('the staff table is unreachable from any client', () => {
  it('a guest cannot read it', async () => {
    const { data, error } = await anonClient().from('staff').select('*')
    expectDenied(error, 'guest reading staff')
    expect(data).toBeNull()
  })

  it('a signed-in customer cannot read it', async () => {
    const { client } = await signedInClient(customerEmail)
    const { data, error } = await client.from('staff').select('*')
    expectDenied(error, 'customer reading staff')
    expect(data).toBeNull()
  })

  it('a customer cannot make themselves the manager', async () => {
    const { client, userId } = await signedInClient(customerEmail)
    const { error } = await client.from('staff').insert({ user_id: userId, role: 'manager' })
    expectDenied(error, 'customer self-granting manager')
  })

  it('a customer cannot make themselves the admin', async () => {
    const { client, userId } = await signedInClient(customerEmail)
    const { error } = await client.from('staff').insert({ user_id: userId, role: 'admin' })
    expectDenied(error, 'customer self-granting admin')
  })

  it('a customer cannot rewrite an existing staff row', async () => {
    const { client, userId } = await signedInClient(customerEmail)
    const { error } = await client.from('staff').update({ user_id: userId }).eq('role', 'manager')
    expectDenied(error, 'customer rewriting a staff row')
  })

  it('a customer cannot delete the staff out of existence', async () => {
    const { client } = await signedInClient(customerEmail)
    const { error } = await client.from('staff').delete().eq('role', 'admin')
    expectDenied(error, 'customer deleting a staff row')
  })
})

describe('the role helpers tell each caller only about themselves', () => {
  it('a customer has no role', async () => {
    const { client } = await signedInClient(customerEmail)
    const { data, error } = await client.rpc('staff_role')
    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it('a customer is not the manager', async () => {
    const { client } = await signedInClient(customerEmail)
    const { data, error } = await client.rpc('is_manager')
    expect(error).toBeNull()
    expect(data).toBe(false)
  })

  it('a customer is not the admin', async () => {
    const { client } = await signedInClient(customerEmail)
    const { data, error } = await client.rpc('is_admin')
    expect(error).toBeNull()
    expect(data).toBe(false)
  })

  it('a guest cannot even ask', async () => {
    const guest = anonClient()
    for (const fn of ['staff_role', 'is_manager', 'is_admin']) {
      const { error } = await guest.rpc(fn)
      expectDenied(error, `anon calling ${fn}()`)
    }
  })
})

/**
 * These need supabase/seed_staff.sql to have been run against the two
 * addresses in .env. Without it there is nothing to assert, so they say so
 * rather than passing vacuously.
 */
describe.skipIf(!staffConfigured())('the seeded staff accounts carry their role', () => {
  it('the manager account reports the manager role', async () => {
    const { client } = await managerClient()
    const { data, error } = await client.rpc('staff_role')
    expect(error).toBeNull()
    expect(
      data,
      `${STAFF.managerEmail} has no role. Run supabase/seed_staff.sql with that address.`,
    ).toBe(STAFF_ROLES.manager)
  })

  it('the manager is the manager and not the admin', async () => {
    const { client } = await managerClient()
    expect((await client.rpc('is_manager')).data).toBe(true)
    expect((await client.rpc('is_admin')).data).toBe(false)
  })

  it('the admin account reports the admin role', async () => {
    const { client } = await adminClient()
    const { data, error } = await client.rpc('staff_role')
    expect(error).toBeNull()
    expect(
      data,
      `${STAFF.adminEmail} has no role. Run supabase/seed_staff.sql with that address.`,
    ).toBe(STAFF_ROLES.admin)
  })

  it('the admin is the admin and not the manager', async () => {
    const { client } = await adminClient()
    expect((await client.rpc('is_admin')).data).toBe(true)
    expect((await client.rpc('is_manager')).data).toBe(false)
  })

  it('the manager and the admin are two different accounts', async () => {
    const manager = await managerClient()
    const admin = await adminClient()
    expect(manager.userId).not.toBe(admin.userId)
  })

  it('staff still cannot read the staff table directly', async () => {
    const { client } = await managerClient()
    const { data, error } = await client.from('staff').select('*')
    expectDenied(error, 'manager reading staff directly')
    expect(data).toBeNull()
  })
})

/**
 * src/config/staff.js spells the two roles for the UI; public.staff spells them
 * in a check constraint. A browser cannot read a Postgres constraint, so the
 * duplication is unavoidable - what is avoidable is it drifting silently. These
 * probe the real database with the UI's own constants, so renaming one end
 * without the other fails here rather than in production.
 */
describe.skipIf(!staffConfigured())('the UI role constants match the database', () => {
  it('the seeded manager comes back as exactly STAFF_ROLES.manager', async () => {
    const { client } = await managerClient()
    const { data } = await client.rpc('staff_role')
    expect(data).toBe(STAFF_ROLES.manager)
    expect(isStaffRole(data)).toBe(true)
  })

  it('the seeded admin comes back as exactly STAFF_ROLES.admin', async () => {
    const { client } = await adminClient()
    const { data } = await client.rpc('staff_role')
    expect(data).toBe(STAFF_ROLES.admin)
    expect(isStaffRole(data)).toBe(true)
  })

  it.skipIf(!chefConfigured())(
    'the seeded chef comes back as exactly STAFF_ROLES.chef',
    async () => {
      const { client } = await chefClient()
      const { data } = await client.rpc('staff_role')
      expect(data).toBe(STAFF_ROLES.chef)
      expect(isStaffRole(data)).toBe(true)
    },
  )

  it.skipIf(!chefConfigured())(
    'every role the UI knows about is a role the database actually issues',
    async () => {
      // One seeded account per role in STAFF_ROLES. Adding a role to the UI
      // constant without seeding an account for it fails here — which is
      // exactly what happened when the chef role was added, and is the reason
      // this test is worth having.
      const issued = new Set()
      for (const { client } of [await managerClient(), await adminClient(), await chefClient()]) {
        issued.add((await client.rpc('staff_role')).data)
      }
      expect([...issued].sort()).toEqual([...ALL_STAFF_ROLES].sort())
    },
  )

  it('a customer is not mistaken for a staff role', async () => {
    const { client } = await signedInClient(customerEmail)
    const { data } = await client.rpc('staff_role')
    expect(isStaffRole(data)).toBe(false)
  })
})
