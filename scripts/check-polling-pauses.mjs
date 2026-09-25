/**
 * M-2's proof: polling must stop while the tab is hidden.
 *
 * Counts real Supabase requests over equal windows with the tab visible and
 * hidden. The tab is hidden by opening a second one, which is a genuine browser
 * visibility change rather than an overridden flag.
 *
 * Run it against the live URL as a control: that deployment still carries the
 * pre-fix code, so it should keep polling while hidden. A check that cannot
 * show the bug is not evidence that the bug is gone.
 *
 *   node scripts-m2-check.mjs http://localhost:4173
 *   node scripts-m2-check.mjs https://forno-pizza-shop.forno-pizza-dev.workers.dev
 */
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const BASE = process.argv[2] ?? 'http://localhost:4173'
const WINDOW_MS = 35_000 // three poll intervals at STAFF_POLL_MS = 10s

const pages = async () =>
  (await (await fetch('http://localhost:9222/json/list')).json()).filter((x) => x.type === 'page')
const target = (await pages())[0]
const ws = new WebSocket(target.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
let polls = 0
let counting = false
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
  if (
    counting &&
    m.method === 'Network.requestWillBeSent' &&
    m.params.request.url.includes('supabase') &&
    m.params.request.method !== 'OPTIONS'
  )
    polls++
}
await new Promise((r) => (ws.onopen = r))
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id
    pending.set(n, res)
    ws.send(JSON.stringify({ id: n, method, params }))
  })
const ev = async (expr) =>
  (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }))
    .result?.result?.value
await send('Page.enable')
await send('Runtime.enable')
await send('Network.enable')
const waitFor = async (expr, ms = 25_000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 300))
    if (await ev(expr).catch(() => false)) return true
  }
  return false
}

await send('Page.navigate', { url: `${BASE}/staff` })
await waitFor(`!!document.querySelector('input[type=password]')`)
await ev(`(() => {
  const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set
    d.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  set(document.querySelector('input[type=email]'), ${JSON.stringify(env.TEST_CHEF_EMAIL)})
  set(document.querySelector('input[type=password]'), ${JSON.stringify(env.TEST_USER_PASSWORD)})
  document.querySelector('form').requestSubmit(); return true })()`)
await waitFor(`location.pathname === '/chef'`)
await new Promise((r) => setTimeout(r, 2000))

const measure = async (label, ms = WINDOW_MS) => {
  polls = 0
  counting = true
  await new Promise((r) => setTimeout(r, ms))
  counting = false
  const hidden = await ev('document.hidden')
  console.log(
    `  ${label.padEnd(26)} document.hidden=${String(hidden).padEnd(6)} supabase calls: ${polls}`,
  )
  return polls
}

console.log(`\nPOLLING ON /chef — ${BASE}`)
console.log(`${WINDOW_MS / 1000}s windows, poll interval 10s\n`)

const visible = await measure('tab VISIBLE')

const second = await (
  await fetch('http://localhost:9222/json/new?about:blank', { method: 'PUT' })
).json()
await new Promise((r) => setTimeout(r, 800))
if (!(await ev('document.hidden'))) {
  console.log('\n  !! could not hide the tab — this check is INVALID')
  process.exit(2)
}
const hidden = await measure('tab HIDDEN')

// Counting starts BEFORE the tab comes back, or the catch-up fetch fires
// during the wait and goes uncounted — which reads as "no catch-up" on a
// listener that is working perfectly.
polls = 0
counting = true
await fetch(`http://localhost:9222/json/close/${second.id}`)
await new Promise((r) => setTimeout(r, 3000))
counting = false
console.log(`  ${'on becoming visible again'.padEnd(26)} ${' '.repeat(22)}supabase calls: ${polls}`)

console.log('\n  visible:', visible, ' hidden:', hidden, ' catch-up:', polls)
const paused = hidden === 0
console.log(
  `  ${paused ? 'PAUSED while hidden' : 'STILL POLLING while hidden'} — ${hidden} request(s) in ${WINDOW_MS / 1000}s`,
)
ws.close()
process.exit(paused && visible >= 2 ? 0 : 1)
