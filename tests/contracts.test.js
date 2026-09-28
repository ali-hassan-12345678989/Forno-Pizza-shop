/**
 * Contracts between files that have no other way of noticing each other.
 *
 * Both of these come from Audit 3, and both are the same shape of problem: a
 * rule that was true when someone wrote it, enforced only by that person
 * remembering. Neither is a bug in any single file. Each is a gap *between*
 * files, which is exactly the kind of thing no amount of reading one file
 * catches, and exactly the kind a five-line test holds forever.
 *
 * These read from disk rather than from imports on purpose — the SQL is not
 * importable, and the point is to compare what is actually written down.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ORDER_ERRORS } from '../src/api/orders.js'
import { COPY } from '../src/content/copy.js'

const SUPABASE_DIR = join(import.meta.dirname, '..', 'supabase')

const read = (file) => readFileSync(join(SUPABASE_DIR, file), 'utf8')
const sqlFiles = () => readdirSync(SUPABASE_DIR).filter((f) => f.endsWith('.sql'))

/** Every `raise exception 'code'` in a file, deduplicated. */
function codesRaisedIn(file) {
  const matches = read(file).matchAll(/raise exception\s+'([a-z_]+)'/g)
  return [...new Set([...matches].map((m) => m[1]))].sort()
}

describe('every order error the database raises reaches the customer', () => {
  /**
   * Audit 3's L-1. `place_order()` raised fourteen codes; the client mapped ten.
   * The other four collapsed to 'unknown' — "we could not place your order,
   * please try again" — which for `too_many_toppings` is a dead end: retrying
   * produces the identical result every time, forever, and never says which
   * choice caused it.
   */
  const raised = codesRaisedIn('place_order.sql')

  it('the SQL actually raises codes, so this test is not vacuous', () => {
    expect(raised.length).toBeGreaterThan(10)
    expect(raised).toContain('empty_cart')
  })

  it.each(raised)('%s is mapped in ORDER_ERRORS', (code) => {
    expect(Object.keys(ORDER_ERRORS)).toContain(code)
  })

  it.each(raised)('%s has a customer-facing message', (code) => {
    const message = COPY.checkout.orderErrors[code]
    expect(message, `no copy for ${code}`).toBeTruthy()
    // 'unknown' is the fallback, so a code whose message IS the fallback has
    // not really been given one.
    expect(message).not.toBe(COPY.checkout.orderErrors.unknown)
  })

  it('every mapped code is one the database can actually raise', () => {
    // The other direction: copy for a code nothing raises is dead weight that
    // reads as covered. cancel_order() and deduct_order_stock() contribute the
    // rest, so those files count too.
    const everywhere = new Set([
      ...codesRaisedIn('place_order.sql'),
      ...codesRaisedIn('order_status.sql'),
      ...codesRaisedIn('deduct_stock.sql'),
      ...codesRaisedIn('schema.sql'),
    ])

    const orphans = Object.keys(ORDER_ERRORS).filter((code) => !everywhere.has(code))
    expect(orphans, `mapped but never raised: ${orphans.join(', ')}`).toEqual([])
  })
})

describe('the SQL folder README labels every file in it', () => {
  /**
   * Audit 3's L-2. supabase/README.md exists because nothing in a filename says
   * whether it rebuilds the shop, wipes it, or deliberately breaks it — it was
   * written as the safety label for this directory. By the third audit it had
   * drifted: two files were unlisted, one of them the largest in the folder.
   *
   * The control was documentation, and documentation drifts silently. This is
   * what stops it drifting again.
   */
  const readme = read('README.md')
  const files = sqlFiles()

  it('there are SQL files to check, so this test is not vacuous', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it.each(files)('%s is named in README.md', (file) => {
    expect(readme).toContain(file)
  })

  it('README.md does not name files that no longer exist', () => {
    const named = [...readme.matchAll(/`?([a-z0-9_]+\.sql)`?/g)].map((m) => m[1])
    const missing = [...new Set(named)].filter((f) => !files.includes(f))
    expect(missing, `named in README but not on disk: ${missing.join(', ')}`).toEqual([])
  })
})
