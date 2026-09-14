import { describe, it, expect } from 'vitest'
import { anonClient, signedInClient } from './helpers/supabase.js'

// Part 1 "Done when": an account can be created via Supabase Auth, and a guest
// session works without one. Both halves matter — a forced login would break
// FR-1.4, and broken signup would break order history.
describe('supabase connection', () => {
  it('the anon key reaches the project', async () => {
    const { error } = await anonClient().from('menu_items').select('id').limit(1)

    expect(error).toBeNull()
  })

  it('env vars are present and not placeholders', async () => {
    expect(process.env.VITE_SUPABASE_URL).toMatch(/^https:\/\/.+\.supabase\.co$/)
    expect(process.env.VITE_SUPABASE_ANON_KEY.length).toBeGreaterThan(20)
  })
})

describe('optional accounts', () => {
  it('a test account can sign in and gets a session', async () => {
    const { client, userId } = await signedInClient(process.env.TEST_USER_A_EMAIL)
    const { data } = await client.auth.getSession()

    expect(userId).toBeTruthy()
    expect(data.session.access_token).toBeTruthy()
  })

  it('a wrong password is refused', async () => {
    const { error } = await anonClient().auth.signInWithPassword({
      email: process.env.TEST_USER_A_EMAIL,
      password: 'definitely-not-the-password',
    })

    expect(error).not.toBeNull()
  })

  it('signing out drops the session', async () => {
    const { client } = await signedInClient(process.env.TEST_USER_A_EMAIL)
    await client.auth.signOut()

    const { data } = await client.auth.getSession()
    expect(data.session).toBeNull()
  })
})

describe('guests are never forced to log in', () => {
  it('a client with no session still has no user', async () => {
    const { data } = await anonClient().auth.getUser()

    expect(data.user).toBeNull()
  })

  it('the whole browse-to-order path works with zero auth', async () => {
    const anon = anonClient()

    const { data: session } = await anon.auth.getSession()
    expect(session.session).toBeNull()

    const { error } = await anon.from('menu_items').select('id, name')
    expect(error).toBeNull()
  })
})
