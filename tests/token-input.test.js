import { describe, expect, it } from 'vitest'
import { isUuid } from '../src/lib/uuid.js'
import { tokenFromInput, trackPath } from '../src/config/routes.js'

/**
 * Reading an identifier that came from outside the app.
 *
 * Two callers share one pattern: the customer pasting a tracking link, and the
 * Admin opening an order from a route parameter. Both are strings a person
 * typed or pasted, and neither may be handed to Postgres unchecked — a bad uuid
 * is a cast error, not a missing row, and reaches the screen as a generic
 * failure offering a retry that can never work.
 */

const TOKEN = '3f2a6c1e-9b7d-4e55-8a11-0c4d9e2b7a63'

describe('is it a uuid', () => {
  it('accepts one', () => {
    expect(isUuid(TOKEN)).toBe(true)
  })

  it('accepts upper case, which a copy-paste can easily be', () => {
    expect(isUuid(TOKEN.toUpperCase())).toBe(true)
  })

  it('refuses anything that is not one', () => {
    for (const bad of [
      '',
      '   ',
      'not-a-uuid',
      '1234',
      TOKEN.slice(0, -1), // one character short
      `${TOKEN}0`, // one too many
      TOKEN.replace('-', ''), // hyphens in the wrong places
      'zzzzzzzz-9b7d-4e55-8a11-0c4d9e2b7a63', // right shape, not hex
      null,
      undefined,
    ]) {
      expect(isUuid(bad)).toBe(false)
    }
  })

  it('refuses an object rather than stringifying it into a pass', () => {
    expect(isUuid({})).toBe(false)
    expect(isUuid([])).toBe(false)
  })
})

describe('pulling a token out of what the customer pasted', () => {
  it('takes the token on its own', () => {
    expect(tokenFromInput(TOKEN)).toBe(TOKEN)
  })

  it('takes it out of a whole tracking URL', () => {
    expect(tokenFromInput(`https://forno.example/track/${TOKEN}`)).toBe(TOKEN)
  })

  it('takes it out of the path this app generates', () => {
    expect(tokenFromInput(trackPath(TOKEN))).toBe(TOKEN)
  })

  it('refuses a link with anything appended after the token', () => {
    /* Documenting what it does, not what it might ideally do. The split is on
       [/?#] and the LAST segment is what gets tested, so `?from=sms` becomes
       the candidate and is rightly rejected. The app never generates such a
       link — trackPath() emits /track/<token> and nothing else — so this is a
       robustness edge, not a live failure. Worth knowing before anyone starts
       adding campaign parameters to tracking links. */
    expect(tokenFromInput(`/track/${TOKEN}?from=sms`)).toBeNull()
    expect(tokenFromInput(`/track/${TOKEN}#top`)).toBeNull()
  })

  it('trims whitespace, because a paste usually carries some', () => {
    expect(tokenFromInput(`  ${TOKEN}\n`)).toBe(TOKEN)
  })

  it('lower-cases it, so a shouted paste still matches the stored uuid', () => {
    expect(tokenFromInput(TOKEN.toUpperCase())).toBe(TOKEN)
  })

  it('returns null for anything that is not a token', () => {
    for (const bad of ['', '   ', 'https://forno.example/track/', 'order 1234', null, undefined]) {
      expect(tokenFromInput(bad)).toBeNull()
    }
  })

  it('refuses an order number, which is guessable by design', () => {
    // The order number is printed on the receipt and is deliberately not a
    // credential. Accepting one here would make it into one.
    expect(tokenFromInput('1306')).toBeNull()
    expect(tokenFromInput('/track/1306')).toBeNull()
  })
})
