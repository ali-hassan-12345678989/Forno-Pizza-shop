# Forno Pizza — Second Audit: Code Quality, Standards & Performance

**Branch:** `audit-2` · **Commit audited:** `933e475` · **Date:** 2026-09-24
**Scope:** the code itself first — standards, best practice, hardcoding, smells — then
features and their runtime performance.
**Method:** static analysis with every tool's strictest settings, plus live measurement
against the deployed site and the production database. **Every scanner in this report was
validated with a planted positive control before its result was believed.** Several of my
own scanners produced false positives; where that happened it is stated, because a finding
that dissolves on inspection is not a finding.

**Relationship to Audit 1:** that audit was adversarial and security-focused — it attacked a
running system. This one reads the code. They are deliberately different lenses, and the
comparison at the end shows what each one could and could not see.

---

## Verdict up front

**The code is in good shape and meets professional standards.** The linter finds *zero*
correctness defects. Hardcoding is genuinely absent, not merely tidy. The SQL layer is
stronger than most production systems I would expect to see. The test suite is honest —
including a helper that explicitly defends against vacuous assertions.

No CRITICAL or HIGH findings. What follows is four MEDIUM and six LOW, of which the two
worth acting on are a **customer-facing bug in the tracking-link parser** and **polling that
never stops**.

---

## MEDIUM

### M-1. Tracking links with a query string are rejected

**What's wrong:** `tokenFromInput()` splits on `/`, `?` **and** `#`, then takes the *last*
segment. Any tracking URL carrying a query string or fragment yields the query, not the token.

**How I proved it** — ran the real function against inputs a customer would actually paste:
```
bare token                 accepted
full URL                   accepted
URL + query (?from=sms)    *** REJECTED ***
URL + utm tag              *** REJECTED ***
URL + hash                 *** REJECTED ***
URL + trailing slash       accepted
uppercase token            accepted
padded with spaces         accepted
```
**3 of 8 realistic inputs fail.**

**Real-world impact:** WhatsApp, SMS gateways and email clients routinely append tracking
parameters to links. A customer who pastes the link their friend forwarded gets *"We could not
find that order."* The order is fine; the parser rejected a valid link. This is the customer's
only route back to a guest order, so the failure is total for them.

**Note:** Audit 1 mentioned this in passing as a "known robustness edge" but never logged it
as a finding. It should have been one.

### M-2. Polling never pauses, and the code says it does

**What's wrong:** `useAutoRefresh` sets an interval and adds a `visibilitychange` listener —
but the listener only fires an **extra** refresh when the tab becomes visible. Nothing checks
visibility inside the tick, so the interval keeps firing in a background tab forever.

**How I proved it** — read the hook, then confirmed no guard exists and traced every caller:
```
src/lib/useAutoRefresh.js  tick = () => reload({ silent: true })   <- no visibility check
                           setInterval(tick, everyMs)              <- unconditional

callers, all at STAFF_POLL_MS = 10s:
  AdminDashboard.jsx:49   AdminOrders.jsx:35
  ChefKitchen.jsx:32      ManagerDashboard.jsx:51
customer tracker: Track.jsx:90, STATUS_POLL_MS = 20s (same shape, own copy)
```

**And the documentation is wrong**, which is the worse half. The commit that shipped this says:

> *"…customer tracker, **paused while the tab is hidden**."*

It is not. A future developer will read that and trust it.

**Real-world impact:** four staff screens left open on a counter make **~11,500 requests per
8-hour shift** whether or not anyone is looking at them, at roughly 11 KB a poll — about
**15.6 MB per shift** of pure waste. On Supabase's free tier that is quota spent on nothing.
The fix is one line (`if (document.hidden) return`), and the tracker's own `if (settled) return`
already shows the pattern being applied correctly elsewhere.

### M-3. Fonts are loaded by CSS `@import`, which gates first paint

**What's wrong:** `src/index.css` line 1 is
`@import url('https://fonts.googleapis.com/css2?…')`, and `index.html` has no `preconnect`.
The browser cannot discover the font request until it has downloaded **and parsed** the
stylesheet, creating a strictly serial chain.

**How I measured it** — cold-cache waterfall against the live site:
```
  185ms    53ms  index-BLMmw28o.css
  238ms   728ms  css2                 <- fonts.googleapis.com, discovered only now
  navigation timing: {"ttfb":182,"domContentLoaded":997,"fcp":1020}
```
The font stylesheet finishes at ~966ms; **first contentful paint is 1020ms**. The font chain
is what first paint is waiting on.

**Real-world impact:** roughly **700ms added to every first visit**, worst on the mobile
connections this shop's customers will mostly be using. `display=swap` is already in the URL,
so the font *files* don't block — but the stylesheet does, and `@import` guarantees it is
found late. Standard practice is `<link rel="preconnect">` to both font hosts plus a
`<link rel="stylesheet">` in the HTML head.

### M-4. The first two database queries run one after the other

**What's wrong:** `SettingsGate` holds the entire tree until `shop_settings` resolves, so the
menu query cannot even be issued until settings comes back.

**How I proved it** — every Supabase request on `/menu`, with method, cold cache:
```
     0ms  GET      shop_settings
     0ms  OPTIONS  shop_settings
   633ms  POST     rpc/menu_review_summary
   633ms  GET      menu_items
   635ms  OPTIONS  rpc/menu_review_summary
```
The menu starts **633ms** after settings — strictly serial, not overlapped.

**Real-world impact:** about **600ms** added before any menu data is even requested. The
blocking gate is a deliberate design decision documented in `SettingsContext` (no fallback
values in code, one source of truth) and that reasoning is sound — but the *menu* query does
not depend on settings and could be issued in parallel.

**Also visible in that trace:** every Supabase call pays a **CORS preflight** round trip. That
is Supabase's `Access-Control-Max-Age`, not something this app controls, but it doubles the
request count on a cold page.

---

## LOW

### L-1. A search field is copy-pasted into four components

`jscpd` reports **9 clone pairs, 0.87% duplicated lines** — an excellent figure. But one
25-line block appears four times:
```
   25 lines  components/AdminMenuList.jsx:50-74 <-> components/AdminOrderList.jsx:45-69
   25 lines  components/AdminMenuList.jsx:50-74 <-> components/StockTable.jsx:61-85
   25 lines  components/AdminMenuList.jsx:50-74 <-> components/UsageTable.jsx:70-94
```
It is a labelled search input with a hand-written magnifying-glass SVG — **and the project
already has an icon module** (`components/icons.jsx`, 19 exports) that this bypasses. Of 17
inline `<svg>` elements in components and pages, 11 sit outside the two icon modules.

**Impact:** none today. It is the kind of thing that drifts — one of the four gets a fix the
others don't.

### L-2. Two components carry most of the complexity

Measured by brace counting, not by the linter's line heuristic:
```
  544  MenuItemEditor()  components/MenuItemEditor.jsx   (file: 678 lines)
  350  Checkout()        pages/Checkout.jsx              (file: 421 lines)
  179  ItemModal()       components/ItemModal.jsx
```
**Non-component functions over 60 lines: 0.** The logic is well factored; it is the JSX that
is long. `MenuItemEditor` does item fields, sizes, reordering, deletion and three dialogs in
one component.

### L-3. The stale-write guard is applied inconsistently

`useAsyncData` (`aliveRef`), `ItemReviews` (`let live`) and `ChefOrders` (`const alive`) all
guard state updates against a response landing after unmount. Six files do not:
`AuthContext`, `SettingsContext`, `ReviewPanel`, `ReceiveStock`, `MenuItemEditor`, `Orders`.

I checked each rather than counting: **only `AuthContext` and `SettingsContext` actually
await-then-setState**, and both are providers mounted at the app root that never unmount. The
other four have no async setState at all.

**Impact:** nil today. It is a pattern inconsistency, and the risk only appears if one of
those components is later made to re-fetch on a prop change.

### L-4. Ten functions are granted without first revoking from `public`

Thirty-two functions follow `revoke … from public` then `grant … to anon, authenticated`.
Ten skip the revoke: `can_write_order`, `cancel_order`, `experience_summary`,
`get_order_by_token`, `item_reviews`, `menu_review_summary`, `order_reviews`,
`order_status_values`, `place_order`, `submit_review`.

All ten are *intended* to be callable by anyone, so nothing is exposed that should not be.
But Postgres grants EXECUTE to `PUBLIC` by default, so these rely on that default rather than
stating their intent — and a role added later inherits them silently.

### L-5. The tracker re-implements the polling hook

`Track.jsx:87-95` writes its own `setInterval` + `visibilitychange` pair instead of using
`useAutoRefresh`. It is below jscpd's threshold, so the clone detector misses it. It does add
`if (settled) return`, which correctly stops polling on a finished order — a good behaviour
the shared hook lacks.

### L-6. `key={index}` in two places — both justified

```
src/components/ChefOrders.jsx:126   <li key={index}>
src/pages/Menu.jsx:141              <div key={i} className="skel-card">
```
The first carries an explicit `eslint-disable` with a written reason ("two identical lines are
genuinely identical"); the second is a static skeleton. **Recorded as verified-correct, not as
a defect.**

---

## What the strict pass found clean

Each of these was measured, not assumed, and each scanner was proven with a planted control.

| Check | Result |
|---|---|
| oxlint `correctness` on `src/` | **0 findings** |
| oxlint `suspicious` + `perf` | 14 findings — **all 14 false positives** (see below) |
| Hard-coded colours outside `index.css` | **0** |
| Hard-coded route paths outside `config/routes.js` | **0** |
| Hard-coded external URLs | 2, both named constants (`UNSPLASH_BASE`, a UI placeholder) |
| Status/role string literals outside config | 7, all enum *definitions* or copy lookup keys |
| Client/server limits agreeing (name, address) | **both AGREE** — and a parity test enforces it |
| SECURITY DEFINER functions pinning `search_path` | **55 of 55** |
| Tables with RLS enabled | **16 of 16** |
| Foreign-key columns with a supporting index | **18 of 18** |
| Code duplication (jscpd) | **0.87%** |
| Non-component functions over 60 lines | **0** |
| `.map()` renders without a `key` | **0** |
| `useEffect` with no dependency array | **0** |
| `innerHTML` / `eval` / `document.write` | **0** |
| Tests with no assertion | **0** (6 flagged, all false positives) |
| Skipped or `todo` tests | **0** |
| Accessibility static checks | **0 real findings** (3 flagged, all false positives) |

**On the 14 lint "suspicious" findings:** all were `no-array-sort` / `no-array-reverse`
warnings about in-place mutation. I read every one. **Every single site operates on a freshly
created array** — either `.map()` output or an explicit `[...spread]`. The rule does not do
dataflow analysis; the codebase was already correct. The four `no-await-in-loop` hits are
deliberate sequential writes whose ordering carries meaning (`ReceiveStock` removes each line
as it lands so a retry only retries failures).

**On the 6 "tests with no assertion":** five were privilege-escalation tests using an
`expectDenied()` helper my scanner did not follow. That helper is better than a bare assertion:
```js
expect(error.code, `${what}: refused with ${error.code} instead of ${PERMISSION_DENIED}. ` +
  'A missing table or function errors too, which would make this assertion vacuous.')
  .toBe(PERMISSION_DENIED)
```
It explicitly defends against passing for the wrong reason. The sixth was simply longer than
my parser's window.

**Test suite shape:** 36 files, 522 cases, 827 assertions (1.6 per test), 6,436 test lines
against 11,239 source lines — a **0.57:1** ratio.

**And it passes**, run on this branch against the live database as part of this audit:
```
 Test Files  36 passed (36)
      Tests  593 passed (593)
   Duration  203.70s
```
(593 executed cases against 522 `it(...)` declarations — the difference is `it.each` tables
expanding into one case per row.)

---

## Feature performance, measured live

Median of 5 runs against the production database:

| Call | Median | Payload |
|---|---|---|
| `menu_items` + sizes + toppings | 231ms | 20.1 KB |
| `shop_settings` | 226ms | 0.3 KB |
| `chef_orders()` | 224ms | — |
| `staff_ingredients()` | 229ms | 4.9 KB |
| `staff_ingredient_usage()` | 230ms | 6.2 KB |
| `admin_orders(100)` | 223ms | — |
| `admin_menu_items()` | 226ms | 10.0 KB |
| `sales_report(day, 30)` | 220ms | — |

Every figure is ~220ms, which is suspicious — so I measured the floor:
```
  bare HTTP round trip to Supabase   median  43ms
  trivial RPC (returns a text[])     median 221ms
  => query work beyond the round trip: ~177ms
```

**No query in this application is slow.** A function that returns a hard-coded array takes the
same 221ms as one that aggregates the whole sales history. The ~180ms is fixed overhead on the
Supabase instance — free-tier compute and region distance from Pakistan. **Nothing in the code
can improve it; a paid tier or a closer region would.** This matters because it means the
optimisation targets are the *number* of round trips (M-4) and the *serial chains* (M-3), not
the queries themselves.

Customer bundle is unchanged from the last deploy: **174.0 kB over the wire**, 42 staff chunks
still split out and confirmed absent from the entry.

---

## Comparison with Audit 1

| | Audit 1 (22 Sep → 24 Sep) | Audit 2 (this one) |
|---|---|---|
| Lens | Adversarial security, black-box | Code quality, standards, performance |
| Method | Attack a running system | Read the code, measure the runtime |
| CRITICAL | 0 | **0** |
| HIGH | 1 (unverified — the redirect allow-list) | **0** |
| MEDIUM | 4 | **4** |
| LOW | 6 | **6** |
| Status of its findings | **all closed** | open, listed above |

### What changed

**Every Audit 1 finding is closed.** Ten were fixed in code and deployed in `933e475`; H-1
(the redirect allow-list) was confirmed clean in the Supabase dashboard; M-1 (email
confirmation off) is a documented, deliberate decision. **This audit found no regression from
any of those fixes** — the security properties Audit 1 established still hold, the contrast
work still passes, and the bundle split survived.

### What each audit could not see

This is the useful part of running two.

**Audit 1 was structurally blind to everything in this report.** It attacked endpoints; it never
read a waterfall, never counted a poll, never ran a duplication detector. It could not have
found the font chain, the serial queries, or polling that never sleeps — none of those are
reachable by sending hostile requests.

**Audit 2 is equally blind to what Audit 1 found.** Reading code does not prove that two
simultaneous orders cannot oversell the last item, that a customer cannot read another's order
by UUID, or that a Manager cannot reach an Admin function. Those needed a live attack.

**One finding falls in the gap between them, and that is the lesson.** `tokenFromInput`
rejecting query strings was *noticed* during Audit 1 and written off as a "known edge". It is a
customer-facing bug — the only route back to a guest order. A security lens saw it and did not
care; a code-quality lens logs it as M-1. **Things noticed in passing and not written down are
things that do not get fixed.**

### Direction of travel

Audit 1's findings were mostly *absent defences* — no frame headers, no recipe guard, no token
expiry, a cascade nobody had thought through. Audit 2's are mostly *efficiency and consistency*
— nothing is unsafe, several things are wasteful. That is the normal and healthy progression
for a codebase: the second audit is scraping a better barrel.

---

## Summary

| Severity | Count |
|---|---|
| **CRITICAL** | **0** |
| **HIGH** | **0** |
| **MEDIUM** | **4** |
| **LOW** | **6** |
| *Verified clean* | *18 whole-codebase checks* |
| *False positives investigated and dismissed* | *23* |

### Plain-English verdict

**Yes — this code meets global standards, and in the places that usually decide whether a
system survives contact with production, it is better than most.**

Zero hardcoded colours, zero hardcoded routes, zero correctness defects, 0.87% duplication, and
every single `SECURITY DEFINER` function pinning its `search_path` — that last one is the
commonest Postgres privilege-escalation hole in the wild and it is closed 55 times out of 55.
RLS on every table. An index behind every foreign key. A test suite that guards against its own
assertions passing vacuously. I went looking for problems with the strictest settings the
tooling allows and had to discard 23 false positives to find 10 real observations, none of them
severe.

**What I would actually do, in order:**

1. **M-1, the tracking-link parser.** This is the only finding here that a customer can hit, and
   when they hit it the feature simply does not work for them. It is a small change to
   `tokenFromInput` plus tests for the inputs above.
2. **M-2, the polling.** One line stops thousands of pointless requests per shift — and the
   comment claiming it already does this should be corrected either way, because a wrong comment
   is worse than no comment.
3. **M-3 and M-4 together.** About 1.3 seconds of the customer's first visit is spent on a font
   chain and two queries that could overlap. Both are standard, low-risk changes.

The LOW findings are housekeeping. None of them should hold anything up.

**Scope note:** this audit covered source code, SQL, tests, the bundle and live runtime
performance. It did not re-run Audit 1's attack suite — those results are inherited, and they
were verified as recently as the fixes being deployed.
