# Forno Pizza — Third Audit: Architecture, Real-World Performance, Feature Gaps

Branch: `audit-3` · Base: `fb3181c` · Date: 2026-09-28

---

## How this audit was run, and what it deliberately did not do

**Nothing was written to the database.** The shop went live on 25 September; orders start
at #1000 and every ingredient is at its opening level. Audit 1 damaged production data
while probing and needed a repair script. That is not repeatable now, so every finding
below is either **measured read-only against the live site** or **reasoned from the source**,
and each finding says which.

Three findings could only be *proved* by writing to the database. They are reported as
reasoned, with the exact test that would confirm them, for you to run against a scratch
project — not this one.

**Lens:** the first two audits looked at the system from the outside (attack it) and from
the inside (read it). This one looks at the **seams** — the places where the browser, the
network, the client library and the database meet, and where each layer is individually
correct but the chain between them is not. That is where the remaining problems live.

---

## Verdict up front

The code is still good. Two audits have taken the obvious defects out, and a third pass
over the same ground finds very little: no stray `console.*`, no TODOs, no dead modules,
images correctly sized and lazy-loaded with the hero marked `fetchPriority="high"`, 67
`aria-label`s and 50 `role`s across the UI, and an error path for every call site.

**The problems that remain are not in the code. They are in the architecture around it,
and in one number everyone has been quoting that measures the wrong thing.**

The headline: **a first-time customer waits 2.3 seconds to see a pizza.** The "304ms first
paint" reported after Audit 2 — including by me — is the time to paint a *loading spinner*.
That figure is real, it is just not the thing a customer experiences.

---

## HIGH

### H-1. The reported load time measures a spinner, not the shop

**Proved.** Measured against the live site, cold cache, median of 3 runs.

`SettingsGate` renders `<div class="gate">` — a spinner — and returns `children` only once
`shop_settings` has come back from the database. Nothing else exists on the page until then:
no header, no hero, no menu. First Contentful Paint therefore fires on the spinner.

```
/menu, cold cache, live site
  first pixel (FCP)          ~500ms     <- this is the spinner
  blocking spinner appears   1328ms
  blocking spinner clears    2327ms
  ACTUAL MENU ON SCREEN      2329ms     <- what the customer experiences

  database calls:
     1035 -> 1325ms  (290ms)  shop_settings
     1349 -> 1749ms  (400ms)  rpc/menu_review_summary
     1349 -> 1696ms  (347ms)  menu_items
```

```
/ (home), cold cache
  first pixel (FCP)          716ms
  blocking spinner appears   678ms
  blocking spinner clears    1653ms
  ACTUAL CONTENT             1653ms
     669 -> 1639ms  (970ms)  shop_settings
```

**How this was measured:** CDP `Runtime.evaluate` polling for `.gate` and `.pcard-name`
(a real menu item) on a 16ms timer, with `Network.setCacheDisabled` and
`Network.clearBrowserCache` between runs. The first version of this script used
`requestAnimationFrame` and hung, because rAF is paused in a background window — worth
recording, because it is the kind of thing that silently produces a wrong number instead
of no number.

**Impact.** The M-3 font fix from Audit 2 was real and correct — the font stylesheet does
now start at 47ms instead of 238ms. But it improved the time to show a spinner. The shop
itself still takes 2.3 seconds, and the four sub-findings below are why.

**What I got wrong, on the record:** I reported "FCP median 304ms, down from 1020ms" as a
customer-facing win. It is a genuine improvement to an internal metric. It is not what the
customer waits for, and I should have measured to real content before claiming it.

---

### H-2. Order flooding — the rate limit only counts phone numbers

**Reasoned from source. NOT tested, deliberately.**

`place_order()` has exactly one throttle (`supabase/place_order.sql:179-190`):

```sql
select count(*) into v_recent
from public.orders o
where o.customer_phone = v_phone
  and o.created_at > now() - interval '2 minutes';

if v_recent >= 5 then
  raise exception 'rate_limited';
end if;
```

The counter is keyed on `customer_phone`. Change the number and the counter resets. The
project's own test helper already does this — `randomPhone()` in `tests/helpers/supabase.js`
exists precisely so tests do not trip this limit.

There is nothing else: no per-IP limit (a Postgres function cannot see the caller's IP), no
CAPTCHA, no account requirement, no payment step. Orders are cash on delivery, so there is
no card to decline.

**Why it matters.** Every accepted order runs the recipe engine and deducts real stock.
Working from the opening levels in `go_live_reset.sql`, the smallest stocks are
`Chicken Fillet` at 180 units and `Burger Bun` at 200. A loop placing single-item orders
with a fresh phone number each time drains an ingredient in **on the order of 180 requests**;
at the ~400ms per call measured above that is **roughly 70–90 seconds**. When an ingredient
hits zero, `refresh_sold_out()` marks every item whose recipe needs it as out of stock —
so a handful of ingredients takes most of the menu offline. Meanwhile the kitchen screen
fills with orders that no one will collect, and `stock_movements` fills with entries that
have to be unpicked by hand.

Nothing here is a privilege escalation. It is a business-availability attack that needs no
account, no payment and no skill.

**How to prove it without touching production:** on a scratch Supabase project seeded from
`seed_menu.sql` + `seed_recipes.sql`, loop `place_order` with `randomPhone()` and a
single-item cart, and watch `staff_ingredients()` fall and `menu_items.out_of_stock` flip.
I did not run this anywhere, because the only database configured in `.env` is the live one.

**Directions worth considering** (each has a real cost, none is obviously right):
- Supabase Edge Function in front of `place_order` so an IP is visible and rate-limitable
- Cloudflare Turnstile on the checkout form — invisible to almost all customers
- A global ceiling: refuse if the shop has taken more than N orders in the last minute,
  since a single-location pizzeria has a known physical maximum
- Require a confirmed phone (OTP) — highest friction, probably wrong for this shop

**Judgement:** the current limit is not useless. It stops a jammed button and a naive script,
which is what its comment claims. It does not stop a deliberate one, and the comment
("Enough to stop a jammed button or a trivial script") slightly oversells it by implying
scripts generally.

---

### H-3. There is no React error boundary anywhere

**Proved.** `grep -rn "componentDidCatch\|ErrorBoundary\|getDerivedStateFromError" src/` returns nothing.

React 19 unmounts the entire tree when a render throws and no boundary catches it. The
customer gets a blank white page — no message, no retry, no indication anything is wrong.
Every screen is exposed, including checkout, where it costs a real order.

This is not hypothetical for this codebase. The L-1 finding in Audit 2 was a component
shipping without its stylesheet because of how chunks split; a component throwing for a
similarly structural reason is the same class of problem with a much worse failure mode.

`SettingsGate` handles the *data* error case well, with a message and a retry button. There
is no equivalent for a *render* error.

**Cost to fix:** one small class component wrapped around `<App />`, plus one around the
staff `<Suspense>` so a staff-panel failure cannot blank the customer site.

---

## MEDIUM

### M-1. The database origin is never preconnected — 372ms on the critical path

**Proved.** Measured through CDP `Network.responseReceived` timings on a **fresh Chrome
profile** that had never contacted the Supabase host.

```
First database call on a genuinely cold visit:
  OPTIONS shop_settings   dns=52ms  connect=320ms (tls=172ms)  server=438ms
  GET     shop_settings                                        server=278ms
```

**372ms of DNS + TCP + TLS**, and it does not begin until the JS bundle has downloaded,
parsed, mounted React and run `SettingsProvider`'s effect — measured at ~1035ms into the load.

`index.html` preconnects to `fonts.googleapis.com` and `fonts.gstatic.com`. It does not
preconnect to the one origin that actually gates the first paint. Audit 2 applied exactly
this fix to fonts and proved it works; the same one-line fix was never applied to the
database.

```html
<link rel="preconnect" href="https://<project>.supabase.co" crossorigin />
```

`crossorigin` is required — these are CORS requests, and a preconnect without it warms a
connection the browser will not reuse. That is the same trap documented in the font comment.

**A caution on measuring this.** My first attempt used the page's own Resource Timing API
and reported `dns=0 connect=0 tls=0`. That is not a warm connection, it is the cross-origin
masking rule: without a `Timing-Allow-Origin` header the browser zeroes those fields. The
numbers above come from CDP, which is not subject to it. A preconnect "verified" with
Resource Timing would look like it changed nothing.

---

### M-2. The menu cannot start loading until the shop settings have arrived

**Proved.** From the H-1 waterfall:

```
1035 -> 1325ms  shop_settings
1349 -> 1749ms  menu_review_summary     <- starts 24ms AFTER settings finished
1349 -> 1696ms  menu_items              <- same
```

This is Audit 2's M-4, deferred at the time, now measured. `SettingsGate` renders `children`
only once settings exist, so `Menu` does not mount — and therefore does not fetch — until
the settings round trip completes. The two are strictly sequential, and the gap is the full
duration of the first call, **~290ms**.

Both requests could be in flight from the same moment. The menu does not depend on the
settings; the gate is what makes it wait.

**Three ways out, in increasing order of ambition:**
1. Kick off `fetchMenu()` at module load, outside React, and hand the promise to the page —
   smallest change, saves the full ~290ms.
2. Stop blocking on settings. The header, hero and nav are static; only the phone number,
   hours and delivery fee come from the database. Render the shell immediately.
3. One `public_bootstrap()` RPC returning settings + menu + review summary together. Turns
   three round trips into one. Given Audit 2 established that ~180ms of every call is fixed
   instance overhead regardless of the query, **merging calls is the single highest-leverage
   optimisation available in this system.**

Option 2 is the one that changes what the customer sees, because it removes the spinner
entirely rather than shortening it.

---

### M-3. Immutable assets are served `max-age=0, must-revalidate`

**Proved.**

```
$ curl -sI .../assets/index-BMPuQCF_.js
cache-control: public, max-age=0, must-revalidate
etag: "e59b8ff788510f5332b83c37a2c287ea"
```

Vite gives every asset a content hash in its filename. `index-BMPuQCF_.js` can never change
content — a change produces a different filename. These files are safe to cache for a year,
and are being cached for zero seconds.

Every repeat visitor therefore makes a conditional request for all four entry assets and
waits for four `304 Not Modified` responses before the app can start. From Pakistan, against
the measured round trips, that is meaningful dead time on every visit after the first.

`public/_headers` sets six security headers and says nothing about caching, so Cloudflare's
default applies. The fix belongs in the same file:

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

The HTML shell must stay uncached — it is the file that points at the new hashes.

---

### M-4. 37% of the customer bundle is the Supabase client, including parts deliberately never used

**Proved.**

```
entry total        175.53 kB gzip
  index chunk       98.41 kB
  supabase-js       64.45 kB   <- 36.7%
  jsx-runtime        3.33 kB
  css                9.34 kB
```

The 242 kB chunk Vite happens to name `copy-*.js` is `@supabase/supabase-js`. Searching the
built output finds `RealtimeClient`, `realtime-js`, `phoenix` (the WebSocket transport
realtime uses) and `storage-js` shipping to every customer.

Searching `src/` for `.channel(`, `.subscribe(`, `realtime` or `.storage.` finds **nothing**.
The app uses `.from()`, `.rpc()` and `.auth` only.

**An important piece of context that cuts against the obvious conclusion.** The decision not
to use realtime is deliberate and well argued, in `src/config/staffPoll.js`:

> This is deliberately NOT a WebSocket: a dropped socket leaves a screen that looks healthy
> and is silently frozen, which is worse in a kitchen than ten seconds of lag.

That reasoning is sound and I am not arguing with it. The finding is narrower and stands
regardless: **the shop pays 64 kB for a feature it has decided on purpose never to use.**

`createClient` bundles realtime unconditionally in supabase-js v2, so tree-shaking will not
remove it. Getting the bytes back means composing `@supabase/postgrest-js` and
`@supabase/auth-js` directly instead of the umbrella package. That is real work with real
risk, and it is a judgement call whether ~40 kB gzip justifies it. It should be a decision,
not an accident.

---

### M-5. Opening hours are decorative — orders are accepted at any hour

**Proved by reading the schema and grepping the whole system.**

`shop_settings.hours` is `text not null`, seeded `'Open daily 12pm – 11pm'`. It is rendered
in the header (`Header.jsx:24`) and in the hero copy. Grepping `supabase/*.sql` and `src/`
for `opening_hours`, `open_time`, `close_time`, `is_open`, `opens_at`, `closes_at` or
`business_hours` returns **nothing**.

`place_order()` validates fulfilment type, name, phone, address, notes, cart size, quantity,
toppings, rate limit, item availability and stock. It never asks what time it is.

**Impact.** An order placed at 04:00 is accepted, deducts stock, and sits on the kitchen
board. The tracker tells that customer "25–35 min" — the static string from `shop_settings` —
while the shop is shut. The customer waits for a pizza that is not coming, and the first
thing staff meet at noon is a queue of overnight orders whose customers have given up.

This is the largest *feature* gap in the system, and unusually cheap to close: two columns
on a table that already exists, one check in a function that already validates nine other
things, and a closed-state banner on the menu.

---

### M-6. 622 tests, and not one of them renders a component

**Proved.**

`vitest.config.js` sets `environment: 'node'`. Every test either hits the live Supabase
project or imports a pure function or constant from `src/` — `tokenFromInput`, `waitingMinutes`,
`usageRows`, `menuDraft`, `ORDER_STATUS`, `COPY`. There is no jsdom, no
`@testing-library/react`, and no test that mounts a React element.

**If the entire user interface were deleted, every one of the 622 tests would still pass.**

This is not a theoretical gap — it is the documented cause of a bug that reached production
and survived two audits. Audit 2's L-1 found `.stock-search` styling that only reached one
of four screens, so three Admin screens shipped with the search icon outside the input. No
database test could see it. It was found by hand, in a browser, after the fourth copy of the
component was folded into one.

The database layer is tested to an unusually high standard, including a mutation test that
proves the concurrency test can fail. The UI layer has no equivalent. The asymmetry is the
finding.

**Cheapest meaningful step:** jsdom plus a handful of smoke tests that mount each route and
assert it renders something — that alone would have caught H-3's white-screen class of
failure and Audit 2's L-1.

---

## LOW

### L-1. Two order errors fall through to "please try again", which will never work

**Proved by comparing three layers.**

`place_order()` raises 14 distinct codes. `ORDER_ERRORS` in `src/api/orders.js` maps 10 of
them plus 6 from other functions. Four raised codes are absent, so `errorCodeFrom()` returns
`'unknown'` and the customer sees *"We could not place your order. Please try again."*

| Code | In `ORDER_ERRORS`? | Reachable from the UI today? |
|---|---|---|
| `name_too_long` | no | No — `validation.js` catches it client-side first |
| `address_too_long` | no | No — same |
| `too_many_toppings` | no | **Not today. Latent.** |
| `topping_unavailable` | no | **Only in a race.** |

The first two are fine: client-side validation makes the server check pure defence in depth.

`too_many_toppings` fires above 10 toppings on one line. I checked the live menu — the most
any item offers is **9** (`Chicken Fajita`, `Peri Peri`, `Chicken Supreme`, `Chicken Pepperoni`),
so it is unreachable right now. But an Admin can add toppings from the panel. The day someone
adds a tenth and eleventh, a customer who selects them gets "please try again" — and trying
again produces exactly the same result, forever, with no way to discover which choice is the
problem.

`topping_unavailable` fires if a topping is removed between page load and checkout. Rare,
but it is a real race and the message is actively misleading.

**Fix:** add all four codes to `ORDER_ERRORS` and write two lines of copy. The wider point is
that nothing keeps the SQL's codes and the client's map in step — a test that asserts every
`raise exception` in `place_order.sql` has an entry in `ORDER_ERRORS` and a message in
`copy.js` would hold it, and would have flagged this.

### L-2. The SQL folder's safety label has already drifted

**Proved.** `supabase/README.md` was written for Audit 1's L-6 and opens "Thirty-seven `.sql`
files sit in this folder". There are now **39**, and two are unlisted:

- `l4_revokes.sql` — added by Audit 2's fix
- `audit_fixes.sql` — **30 kB, the largest file in the directory**, entirely unlabelled

The README's whole purpose is that nothing in a filename says whether it rebuilds the shop,
wipes it, or deliberately breaks it. Two audits each added a file and neither updated the
label. The control is documentation, and documentation drifts silently.

A test that asserts every `supabase/*.sql` file is named in `README.md` would cost about six
lines and would never drift again.

### L-3. `schema.sql` silently clobbers a function, and only prose prevents it

The README documents this well:

> Re-running `schema.sql` on an established database therefore **silently** drops every
> customer's extras from their tracking page, with no error.

Correctly identified, and the mitigation is a paragraph someone has to read first. Both
files `create or replace function public.get_order_by_token(uuid)`, and the `schema.sql`
version is the older, toppings-unaware one.

Prose is the weakest available control for a landmine this quiet. `schema.sql` could simply
not define the function — leaving it to `place_order.sql`, which owns the better version —
or could refuse to replace a definition that is already newer.

### L-4. The delivery estimate is a constant

`Track.jsx:126` reads `shop.deliveryEta` / `shop.pickupEta` — the fixed strings "25–35 min"
and "15 min" from `shop_settings`. A customer who orders into a queue of fifteen sees the
same estimate as one who orders into an empty kitchen.

The ingredients for something better already exist: `waitingMinutes()` is a tested pure
function, and `chef_orders()` knows the queue depth. It is currently used on exactly one
screen (`ChefOrders.jsx:104`).

Not a defect — the shop never promised a computed estimate. Worth listing because the data
is already there and it is the cheapest possible improvement to the part of the experience
customers actually complain about.

---

## Verified clean on this pass

Re-checked, found correct, no action:

| Area | Evidence |
|---|---|
| Stray logging | No `console.*` anywhere outside `logDev.js` |
| Leftover markers | No TODO / FIXME / HACK / XXX in `src/` or `supabase/` |
| Dead modules | Every file in `src/lib/` is imported somewhere |
| Image performance | `loading="lazy"` + explicit `width`/`height` on all gallery images; hero correctly eager with `fetchPriority="high"` |
| Layout shift | Every `<img>` carries intrinsic dimensions |
| Accessibility density | 67 `aria-label`, 50 `role`, 32 `aria-hidden`, 16 `aria-busy`, 15 `aria-labelledby`, skip-link present |
| Bundle splitting | 34 chunks; staff code confirmed absent from the entry chunk (only the lazy-import manifest appears) |
| Route/nav coupling | `App.jsx` derives routes from `staffNav.js`, so a section cannot exist in nav without a route or vice versa |
| Secrets | `.env` git-ignored; no key material in `src/` or the built output |
| Error-code hygiene at the DB | Every `raise exception` uses a stable snake_case code, never a prose string |
| CORS preflight caching | Supabase returns `access-control-max-age: 3600` — preflights are a first-visit cost only, not per-request |
| Client validation parity | `validation.js` limits match the SQL's `char_length` checks exactly |

**A false trail worth recording.** A cold load showed six requests to Supabase where three
were expected, which looked like every query firing twice. Capturing the HTTP method showed
three `OPTIONS` preflights and three real requests. There is no duplication. I nearly
reported one.

---

## Comparison with the first two audits

| | Audit 1 | Audit 2 | **Audit 3** |
|---|---|---|---|
| Lens | Attack it from outside | Read it from inside | **Measure the seams between layers** |
| CRITICAL | 0 | 0 | **0** |
| HIGH | 1 (dashboard, closed) | 0 | **3** |
| MEDIUM | 4 | 4 | **6** |
| LOW | 6 | 6 | **4** |
| Status of its findings | all closed | 6 closed, 4 by decision | open |

**Why a third audit found more HIGHs than the second.** Not regression — nothing Audits 1
and 2 fixed has come undone. The three HIGHs are all things the earlier lenses could not
reach:

- **H-1** needed someone to ask what the customer actually sees, rather than what a browser
  metric reports. Audit 2 measured FCP because FCP is the standard number. FCP is the wrong
  number for an app that renders a spinner first, and no amount of reading the code tells
  you that — you have to watch the screen.
- **H-2** needed the threat model to include *the business*, not just *the data*. Audit 1
  proved nobody can read another customer's order or tamper with a price, which is the right
  question for confidentiality and integrity. Availability was never asked about.
- **H-3** is an absence. Audits look at what is there. A missing error boundary has no line
  number to find.

**The pattern across all three audits.** Every audit is bounded by the question it asks:

- Audit 1 asked *"can it be broken into?"* → found missing defences
- Audit 2 asked *"is it well built?"* → found waste and inconsistency
- Audit 3 asked *"what does it actually do, end to end, under real conditions?"* → found
  that a correct front end plus a correct back end can still add up to a 2.3-second wait,
  and that a validated order form plus a validated database can still take orders at 4am

Each audit found things invisible to the others. That is the argument for having run three,
and it is also the warning: a fourth lens would find a fourth class of problem.

---

## Radical improvements worth considering

Not defects. Asked for explicitly, and separated from the findings above so the two are
never confused. Each is scored for effort and for what it actually buys.

### Tier 1 — small effort, real gain

**1. Preconnect the database origin** · one line · saves ~372ms for every new visitor
The fix from M-1. Lowest risk change in this document.

**2. Cache the immutable assets** · three lines in `_headers` · saves four round trips per repeat visit
The fix from M-3.

**3. Enforce opening hours** · two columns, one check, one banner
The fix from M-5. Closes the largest feature gap in the system for perhaps an afternoon of
work, and stops the shop accepting orders it cannot cook.

**4. An error boundary** · one class component · turns a white screen into a message with a retry
The fix from H-3.

**5. A "reorder" button** · no schema change at all
`/orders` already lists a signed-in customer's history with full line items. A button that
refills the cart from a past order is pure front-end work against data that already exists.
For a pizza shop with regulars this is the single highest-value customer feature available,
and it needs nothing from the database.

### Tier 2 — moderate effort, structural gain

**6. One `public_bootstrap()` RPC** · three round trips become one
The third option from M-2. Given the measured ~180ms fixed cost of *any* Supabase call, the
number of calls is the lever, not the speed of the queries. This is the single biggest
performance change available, and it is a Postgres function plus one client change.

**7. Render the shell before the data arrives** · deletes the spinner
The second option from M-2. Changes the experience from "spinner, then shop" to "shop,
then details fill in". This is what actually makes the site feel fast, as opposed to
measuring faster.

**8. Smoke tests that mount each route** · closes the gap in M-6
jsdom plus one test per route asserting it renders without throwing. Roughly a day, and it
covers the exact failure class that produced Audit 2's L-1 and that H-3 warns about.

**9. A contract test between SQL and copy** · about ten lines
Assert every `raise exception '<code>'` in `supabase/*.sql` has an entry in `ORDER_ERRORS`
and a message in `copy.js`. Closes L-1 permanently. The same idea closes L-2: assert every
`supabase/*.sql` file is named in `README.md`.

### Tier 3 — larger bets, listed with their honest cost

**10. Rate limiting that survives a changed phone number**
The fix for H-2. Cloudflare Turnstile on checkout is probably the best effort-to-value
trade: invisible to real customers, and it already sits in front of the site. An Edge
Function wrapper is more work and gives per-IP control. Both add a moving part to a system
whose simplicity is currently a genuine strength — which is exactly why it is a decision
for you rather than a recommendation from me.

**11. Drop the umbrella Supabase package**
The fix for M-4. ~40 kB gzip back, at the cost of composing two packages by hand and owning
that composition through every upgrade. Worth doing only if the bundle becomes a real
constraint. Listed so the 64 kB is a choice.

**12. A computed delivery estimate**
The fix for L-4. Queue depth × average prep time, floored at the shop's own minimum.
Everything needed already exists and is already tested.

**Deliberately not recommended:**
- **WebSockets in place of polling.** `staffPoll.js` already rejected this for a good
  reason — a dead socket looks identical to a quiet kitchen. The reasoning is sound and the
  10-second poll is the right call for a kitchen screen.
- **Anything multi-location, multi-tenant, or built for scale.** `CLAUDE.md` rules it out
  and it remains the right constraint.
- **A payment gateway.** Out of scope by decision, not by oversight.

---

## Summary

| Severity | Count | |
|---|---|---|
| **CRITICAL** | **0** | |
| **HIGH** | **3** | H-1 load time, H-2 order flooding, H-3 no error boundary |
| **MEDIUM** | **6** | preconnect, serial bootstrap, cache headers, bundle, opening hours, no UI tests |
| **LOW** | **4** | error-code gaps, README drift, schema clobber trap, constant ETA |
| *Verified clean* | *12 areas* | |
| *False trails caught before reporting* | *2* | duplicate-requests, cross-origin timing mask |

### Plain-English verdict

**The code is not the problem any more, and that is the finding.**

Two audits have taken this codebase to a genuinely high standard, and a third pass over the
same ground turns up almost nothing: the hygiene is clean, the accessibility is
conscientious, the database layer is tested better than most commercial projects, and the
comments explain reasoning rather than restating syntax.

What is left sits between the pieces. A correct front end and a correct back end still add
up to a customer waiting 2.3 seconds, because nobody measured the thing the customer sees.
A thoroughly validated order form and a thoroughly validated database still accept orders
at four in the morning, because "are we open?" was never a question either layer was asked.
A rate limit that does exactly what its comment says still does not stop the attack it
appears to prevent.

**None of this is urgent in the sense that the shop cannot open — it is open, and it works.**
The honest ranking is: H-3 and the Tier 1 items are an afternoon's work with immediate
return; H-1 and M-2 are the difference between a site that measures fast and one that feels
fast; H-2 is the one to decide about deliberately, before someone else decides for you.

The most useful sentence in this report is the one that applies to the next audit as much
as this one: **every audit is bounded by the question it asks.** Three lenses have now found
three disjoint classes of problem, and there is no reason to believe the fourth would find
nothing.
