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

  /* These eight are the ways a real paste arrives, and three of them used to
     fail. The old test asserted that failure as correct, reasoning that the app
     only ever emits /track/<token>. That reasoning does not hold: the app is
     not what appends ?utm_source=whatsapp — the messenger the link travelled
     through is, after it left us. */
  it.each([
    ['the token on its own', TOKEN],
    ['a whole tracking URL', `https://forno.example/track/${TOKEN}`],
    ['a link carrying a query', `https://forno.example/track/${TOKEN}?from=sms`],
    ['a link carrying a campaign tag', `https://forno.example/track/${TOKEN}?utm_source=whatsapp`],
    ['a link carrying a fragment', `https://forno.example/track/${TOKEN}#top`],
    ['a link with a trailing slash', `https://forno.example/track/${TOKEN}/`],
    ['a link with both a slash and a query', `https://forno.example/track/${TOKEN}/?from=sms`],
    ['a paste that shouted', TOKEN.toUpperCase()],
  ])('reads the token out of %s', (_label, pasted) => {
    expect(tokenFromInput(pasted)).toBe(TOKEN)
  })

  it('still refuses a query string that has no token in front of it', () => {
    // The fix must not turn "anything with a ?" into a pass.
    expect(tokenFromInput('https://forno.example/track/?from=sms')).toBeNull()
    expect(tokenFromInput('?from=sms')).toBeNull()
    expect(tokenFromInput(`https://forno.example/track?token=${TOKEN}`)).toBeNull()
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
