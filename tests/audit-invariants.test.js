/**
 * Everything four audits fixed, asserted in one place.
 *
 * WHY THIS EXISTS. Each audit fixed the previous one's blind spots, and the
 * fourth found that the third had broken three things while fixing thirteen.
 * That is the real risk now: not that a new defect appears, but that an old fix
 * is quietly undone by a later one. A reverted fix looks like ordinary code —
 * there is nothing to notice unless something is watching for it.
 *
 * So each entry below asserts the SHAPE of a fix, at the source, in a way that
 * fails if somebody removes it. These are deliberately shallow: the behaviour
 * is proved by the tests next to it, and this file exists to catch deletion,
 * not to re-prove correctness. It needs no database, so it runs in CI on every
 * push.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8')
const exists = (...parts) => existsSync(join(ROOT, ...parts))

/**
 * The same file with its comments removed.
 *
 * Every "must NOT contain" assertion below has to read this rather than the
 * raw text, and the first version of this file proved why: three of them failed
 * against comments that *describe* the removed code. `left(v_name, 80)` appears
 * in place_order.sql explaining what silent truncation used to look like, and
 * `if (!settings) setError(...)` appears in SettingsContext explaining the bug
 * the fourth audit found. Both are the documentation working exactly as
 * intended, and a tripwire that fires on an explanation is a tripwire nobody
 * will keep.
 */
const code = (...parts) =>
  read(...parts)
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments, JS and CSS
    .replace(/^\s*\/\/.*$/gm, ' ') // line comments, JS
    .replace(/^\s*--.*$/gm, ' ') // line comments, SQL

// ---------------------------------------------------------------------------

describe('AUDIT 1 — security', () => {
  const headers = read('public', '_headers')

  it.each([
    ['clickjacking, the finding that mattered', /X-Frame-Options:\s*DENY/],
    ['and its modern equivalent', /frame-ancestors 'none'/],
    ['MIME sniffing', /X-Content-Type-Options:\s*nosniff/],
    ['referrer leakage of a tracking token', /Referrer-Policy:\s*strict-origin-when-cross-origin/],
    ['HTTPS pinning', /Strict-Transport-Security:\s*max-age=\d+/],
    ['permissions the site never needs', /Permissions-Policy:.*camera=\(\)/],
  ])('%s', (_label, pattern) => {
    expect(headers).toMatch(pattern)
  })

  it('place_order refuses an over-long name rather than truncating it', () => {
    // It used to accept the order and hand the kitchen a different name.
    const sql = read('supabase', 'place_order.sql')
    expect(sql).toContain("raise exception 'name_too_long'")
    expect(sql).toContain("raise exception 'address_too_long'")
    expect(code('supabase', 'place_order.sql'), 'left() was how it silently truncated').not.toMatch(
      /left\(v_(name|address)/,
    )
  })

  it('a tracking link stops working eventually', () => {
    expect(read('supabase', 'place_order.sql')).toMatch(/interval\s+'30 days'/)
  })

  it('raw errors never reach a customer console', () => {
    // logDev is compiled out of the production bundle; console.* is not.
    const offenders = []
    for (const file of walk(join(ROOT, 'src'))) {
      if (file.endsWith('logDev.js')) continue
      if (/\bconsole\.(log|error|warn|info|debug)\s*\(/.test(readFileSync(file, 'utf8'))) {
        offenders.push(file.replace(ROOT, ''))
      }
    }
    expect(offenders).toEqual([])
  })

  it('no real staff address is written into tracked SQL', () => {
    // The public-repo finding. Placeholders only; the real ones live in .env.
    for (const file of ['chef.sql', 'seed_staff.sql']) {
      expect(read('supabase', file), `${file} must carry a placeholder`).toMatch(/REPLACE_WITH_/)
    }
  })

  it('a broken connection surfaces in seconds, not in eight', () => {
    const network = read('src', 'config', 'network.js')
    const ms = Number(/SETTINGS_TIMEOUT_MS\s*=\s*(\d+)/.exec(network)?.[1])
    expect(ms).toBeGreaterThan(0)
    expect(ms).toBeLessThanOrEqual(5000)
  })
})

// ---------------------------------------------------------------------------

describe('AUDIT 2 — quality and waste', () => {
  const TEN_FUNCTIONS = [
    'can_write_order',
    'cancel_order',
    'experience_summary',
    'get_order_by_token',
    'item_reviews',
    'menu_review_summary',
    'order_reviews',
    'order_status_values',
    'place_order',
    'submit_review',
  ]

  // l4_revokes.sql is where the revokes were first issued; the four schema
  // files repeat them so that re-running any one of them cannot reopen the door.
  const grantFiles = [
    'l4_revokes.sql',
    'schema.sql',
    'place_order.sql',
    'reviews.sql',
    'order_status.sql',
  ]
    .map((f) => read('supabase', f))
    .join('\n')

  it.each(TEN_FUNCTIONS)('%s is revoked from PUBLIC before it is granted', (fn) => {
    // Postgres grants EXECUTE to PUBLIC by default, so a grant without a revoke
    // decorates a door that is already open. Re-running any schema file must
    // not reopen it.
    expect(grantFiles).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\(`))
  })

  it('a tracking link survives a tag appended by WhatsApp or SMS', () => {
    const routes = read('src', 'config', 'routes.js')
    // The query and fragment must come off BEFORE the path is split. Splitting
    // on all three at once made `from=sms` the candidate and threw the link away.
    expect(routes).toMatch(/split\(\/\[\?#\]\/\)/)
    expect(code('src', 'config', 'routes.js'), 'the old combined split must be gone').not.toMatch(
      /split\(\/\[\/\?#\]\/\)/,
    )
  })

  it('pollers idle while the tab is hidden', () => {
    expect(read('src', 'lib', 'useAutoRefresh.js')).toMatch(/if \(document\.hidden\) return/)
  })

  it('the tracker uses the shared hook instead of its own timer', () => {
    const track = read('src', 'pages', 'Track.jsx')
    expect(track).toContain('useAutoRefresh')
    expect(code('src', 'pages', 'Track.jsx'), 'no hand-rolled interval').not.toMatch(
      /setInterval\(/,
    )
  })

  it('fonts load in parallel rather than behind the stylesheet', () => {
    expect(read('index.html')).toMatch(/rel="preconnect" href="https:\/\/fonts\.gstatic\.com"/)
    expect(code('src', 'index.css'), '@import serialises the load').not.toMatch(
      /@import[^;]*fonts\.googleapis/,
    )
  })

  it('the search box is one component, not four copies', () => {
    expect(exists('src', 'components', 'SearchField.jsx')).toBe(true)
    // The styling must live with the component. It used to sit in
    // StockTable.css, so three of the four screens shipped unstyled.
    expect(read('src', 'components', 'SearchField.css')).toMatch(/\.stock-search\s*\{/)
    expect(code('src', 'components', 'StockTable.css')).not.toMatch(/\.stock-search\s*\{/)
  })
})

// ---------------------------------------------------------------------------

describe('AUDIT 3 — architecture', () => {
  it('a render error cannot blank the page', () => {
    expect(read('src', 'components', 'ErrorBoundary.jsx')).toContain('getDerivedStateFromError')
    // Inside the chrome, so a failed page does not cost the header too.
    for (const layout of ['CustomerLayout.jsx', 'StaffLayout.jsx']) {
      expect(read('src', 'components', layout), layout).toContain('ErrorBoundary')
    }
    expect(read('src', 'main.jsx'), 'the outermost backstop').toContain('ErrorBoundary')
  })

  it('the database origin is preconnected, with crossorigin', () => {
    // Without crossorigin the browser warms a connection it will not reuse,
    // because PostgREST calls are CORS requests.
    expect(read('index.html')).toMatch(
      /<link rel="preconnect" href="%VITE_SUPABASE_URL%" crossorigin/,
    )
  })

  it('hashed assets are cached for a year and the shell is not cached at all', () => {
    const headers = read('public', '_headers')
    expect(headers).toMatch(/\/assets\/\*/)
    expect(headers).toMatch(/Cache-Control:\s*public, max-age=31536000, immutable/)
    // The shell points at the hashed names, so caching it pins a customer to an
    // old deploy forever.
    expect(headers).toMatch(/Cache-Control:\s*public, max-age=0, must-revalidate/)
  })

  it('the menu request leaves before React does', () => {
    expect(read('src', 'main.jsx')).toMatch(/primeMenu\(\)/)
    expect(read('src', 'pages', 'Menu.jsx')).toContain('consumeMenu')
  })

  it('the shopfront renders from cache, but money waits for the database', () => {
    expect(read('src', 'context', 'SettingsContext.jsx')).toContain('STORAGE_KEYS.shopSettings')
    const app = read('src', 'App.jsx')
    const gated = [...app.matchAll(/<SettingsGate requireFresh>/g)]
    expect(gated.length, 'the cart and the checkout, and only those').toBe(2)
  })

  it('the shop can be told it is shut', () => {
    const sql = read('supabase', 'opening_hours.sql')
    expect(sql).toContain('function public.shop_is_open')
    expect(sql).toMatch(/before insert on public\.orders/)
    expect(sql).toContain("raise exception 'shop_closed'")
  })

  it('a repeat order is priced from today, not from the receipt', () => {
    const reorder = read('src', 'lib', 'reorder.js')
    expect(reorder).toContain('buildReorderPlan')
    expect(reorder, 'the line must be looked up in the current menu').toMatch(/byId\.get\(/)
  })

  it('order history carries the toppings a line was ordered with', () => {
    // Without the join, "order again" silently rebuilt orders without extras.
    expect(read('src', 'api', 'orders.js')).toContain('order_item_toppings')
  })
})

// ---------------------------------------------------------------------------

describe('AUDIT 4 — the fixes that came out of auditing the fixes', () => {
  it('a failed settings request is recorded even when a cache exists', () => {
    // `if (!settings) setError(...)` was the bug: the checkout waits for fresh
    // settings, so a swallowed error left it spinning with no way out.
    expect(code('src', 'context', 'SettingsContext.jsx')).not.toMatch(/if \(!settings\)\s*setError/)
    expect(read('src', 'context', 'SettingsContext.jsx')).toMatch(/setError\(err\.message\)/)
  })

  it('the checkout shows that error rather than spinning on it', () => {
    expect(read('src', 'components', 'SettingsGate.jsx')).toMatch(
      /if \(error && \(!settings \|\| requireFresh\)\)/,
    )
  })

  it('only the two pages that read the menu prefetch it', () => {
    const prime = read('src', 'lib', 'primeMenu.js')
    expect(prime).toContain('shouldPrefetchMenu')
    expect(read('src', 'main.jsx')).toContain('shouldPrefetchMenu')
  })

  it('a primed answer goes stale', () => {
    // It claimed to be a handover while behaving as a cache with no age limit.
    expect(read('src', 'lib', 'primeMenu.js')).toMatch(/MAX_AGE_MS\s*=\s*\d/)
  })

  it('a stale code chunk offers a reload, which is the only thing that works', () => {
    const boundary = read('src', 'components', 'ErrorBoundary.jsx')
    expect(boundary).toContain('isStaleChunk')
    expect(boundary).toMatch(/location\.reload\(\)/)
  })

  it('the closed sign re-reads the clock', () => {
    expect(read('src', 'components', 'ClosedBanner.jsx')).toMatch(/setInterval\(/)
    expect(read('src', 'components', 'ClosedBanner.jsx'), 'and stops on unmount').toMatch(
      /clearInterval\(/,
    )
  })

  it('the orders table has the three indexes it will want', () => {
    const sql = read('supabase', 'order_indexes.sql')
    for (const index of [
      'orders_phone_created_at_idx',
      'orders_active_status_idx',
      'orders_created_at_idx',
    ]) {
      expect(sql).toContain(index)
    }
  })

  it('something runs the tests without being asked', () => {
    const workflow = read('.github', 'workflows', 'checks.yml')
    expect(workflow).toContain('npm run lint')
    expect(workflow).toContain('npm run test:ci')
    expect(workflow).toContain('npm run build')
    expect(workflow, 'CI must need no credentials').not.toMatch(/secrets\./)
  })

  it('there is an answer to "what do we do when it breaks"', () => {
    const ops = read('docs', 'OPERATIONS.md')
    for (const topic of [/backup/i, /rollback|revert/i, /monitor/i, /retention|kept/i]) {
      expect(ops).toMatch(topic)
    }
  })
})

// ---------------------------------------------------------------------------

/** Every file under a directory, recursively. */
function walk(dir) {
  const { readdirSync, statSync } = require('node:fs')
  const out = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else out.push(path)
  }
  return out
}
