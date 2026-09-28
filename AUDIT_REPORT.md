# Forno Pizza — External Security & Code Audit

**Branch:** `audit-full-review` · **Commit audited:** `ab72ffb` · **Date:** 2026-09-24
**Live target:** https://forno-pizza-shop.forno-pizza-dev.workers.dev
**Method:** adversarial. Every claim below was produced by running something against the live
Supabase project and the deployed site, not by reading policy SQL and trusting it. Where a
claim could only be established by reading code, that is stated explicitly.

---

## 0. READ THIS FIRST — damage this audit caused

Proving that the Admin-only gate is enforced in the *database* rather than hidden in the UI
meant calling the Admin functions for real, as a genuine Admin. The gate held. But two of
those calls therefore **succeeded**, because an Admin is permitted to make them, and they
changed live data:

| What happened | How |
|---|---|
| "Crunch Chicken Burger" renamed to "AUDIT-PROBE-RENAME" | `admin_save_menu_item` |
| Chicken Tikka **Medium** (Rs 1050) deleted, **and its 7 recipe rows cascaded away** | `admin_delete_menu_size` |
| 22 orders placed, Rs 73,800 of fake revenue | `place_order` (injection, concurrency and sold-out probes) |
| Chicken Fillet drained to 0 | the concurrency probe, deliberately |

`go_live_reset.sql` **will not** undo the first two — it deliberately never touches the menu
or the recipes. The deleted size id `22222222-2222-2222-2222-222222222222` is also pinned in
`tests/helpers/supabase.js:10`, so **the test suite is currently red**, confirmed by running it:

```
$ npx vitest run tests/admin-orders.test.js
 FAIL  tests/admin-orders.test.js
 Error: place_order failed: item_unavailable
   at placeOrderOrThrow tests/helpers/supabase.js:212:20
   at tests/admin-orders.test.js:35:16

 Test Files  1 failed (1)
      Tests  25 skipped (25)
```
All 25 tests in that file are skipped because the fixture cannot place its setup order against a
size that no longer exists.

**To repair, run these two files in this order:**

1. `supabase/audit_repair.sql` — restores the name, the size (with its original id) and the recipe
2. `supabase/go_live_reset.sql` — clears the 22 orders and refills the shelves

I could not run the repair myself: the sandbox blocked write access to shared resources part-way
through the audit.

---

## CRITICAL

**None.** Every attack in the brief that would have qualified was attempted and failed.

---

## HIGH

### H-1. The Supabase redirect allow-list could not be verified, and an open one leaks password-reset tokens

**What's wrong:** I could not confirm that Supabase's *Redirect URLs* allow-list is correctly
restricted, and I cannot rule out that it is open.

**How I tested it:**
```
c.auth.resetPasswordForEmail(target, { redirectTo: 'https://evil.example.com/steal' })
  -> accepted by API
c.auth.resetPasswordForEmail(target, { redirectTo: 'http://localhost:5173/' })
  -> accepted by API
```
**This result is inconclusive, and I am not claiming a vulnerability.** Supabase's API accepts any
`redirectTo` at call time and validates it against the dashboard allow-list only when the emailed
link is *clicked*, falling back to the Site URL if it is not permitted. Confirming the actual
behaviour needs the dashboard, which an external auditor does not have.

**Real-world impact if the allow-list is open:** a password-reset link contains a one-time token in
its URL. An attacker who triggers a reset for a victim's address with
`redirectTo=https://attacker.site` receives that token when the victim clicks the link in their own
inbox, and takes the account. For a staff account that is the Admin panel.

**What to check:** Supabase Dashboard → Authentication → URL Configuration. *Site URL* should be
`https://forno-pizza-shop.forno-pizza-dev.workers.dev`, and *Redirect URLs* should list only that
origin (plus `http://localhost:5173/**` for development). If a wildcard such as `**` or `*` is
present, that is a real HIGH finding; if not, this drops to informational.

---

## MEDIUM

### M-1. Email confirmation is off — anyone can register under someone else's address

**How I proved it:** signed up a brand-new account against the live project:
```
c.auth.signUp({ email: 'forno.audit.1790232550606@gmail.com', password: ... })
  -> session returned immediately, user id 43713268…
```
A session came back with no confirmation step, so the address was never proven to belong to the
registrant.

**Real-world impact:** someone can register `victim@gmail.com`, and the real owner later finds an
account they never made. It does not grant access to anyone else's data — a new account was
correctly denied everything (see V-3 below) and saw an empty order list — but it enables
impersonation at the shop counter ("I'm the account holder"), junk-account flooding, and it means
the email on an account is not evidence of anything.

**Note:** this is plausibly a deliberate friction trade-off for a pizza shop. It is reported because
it is a security-relevant configuration choice that is currently undocumented, not because it is
necessarily wrong.

### M-2. No clickjacking protection on the staff panels

**How I proved it:**
```
curl -sI https://forno-pizza-shop.forno-pizza-dev.workers.dev/admin \
  | grep -iE "x-frame-options|content-security-policy"
  -> no output
```
Neither `X-Frame-Options` nor a CSP `frame-ancestors` directive is sent, on any route.

**Real-world impact:** an attacker hosts a page that invisibly iframes `/admin/menu` and overlays
bait ("Claim your free pizza"). A Manager or Admin who is already signed in and clicks the bait
actually clicks a control in the framed panel — taking an item off sale, deleting a menu size,
changing a price. The role gate does not help here: the victim genuinely *is* an Admin, and the
browser sends their real session.

### M-3. Deleting a menu size silently destroys its recipe

**How I proved it:** accidentally, in the course of testing the role gate. `admin_delete_menu_size`
removed Chicken Tikka Medium, and `menu_item_sizes` went 34 → 33 while the 7 `recipes` rows behind
that size vanished with it, via `recipes.menu_item_size_id ... on delete cascade`.

The function guards against deleting a size that has **orders**:
```sql
if v_orders > 0 then raise exception 'size_has_orders'; end if;
```
…but there is no equivalent guard, and no warning, for a size that has a **recipe**.

**Real-world impact:** an Admin tidying the menu removes a size and permanently deletes the bill of
materials the inventory engine depends on. There is no undo in the app; recovery means hand-written
SQL, which is exactly what `supabase/audit_repair.sql` now is.

**Mitigating (verified by reading `supabase/deduct_stock.sql:34-37`, not by execution — the size was
already gone):** the engine **fails safe**. `deduct_order_stock` raises `recipe_missing` for a size
with no recipe rather than selling it and deducting nothing. So this is a data-loss and
operability problem, not a silent-drift one. The comment on that guard says it exists "for the day
someone adds a menu item in Part 4 and forgets" — it earned its keep here.

### M-4. A customer's name is silently truncated rather than rejected

**How I proved it:**
```
place_order(p_customer_name: 'A'.repeat(500000)) -> ACCEPTED, stored 80 chars
place_order(p_customer_name: 'A'.repeat(1000))   -> ACCEPTED, stored 80 chars
```
`supabase/place_order.sql:121` does `v_name := left(v_name, 80);` with no error.

**Real-world impact:** low but real — a customer with a genuinely long name, or one who pastes
something by mistake, gets a silently different name on their order and on the kitchen ticket, with
nothing telling them. Compare `p_delivery_notes`, which *rejects* over-long input with
`invalid_notes` rather than trimming it. The two behaviours disagree.

---

## LOW

### L-1. No `Referrer-Policy`, `Strict-Transport-Security`, or `X-Content-Type-Options`

**How I proved it:** `curl -sI` on the live origin returns only Cloudflare's own headers — no
security headers of any kind.

**I tested the concrete risk and it did not materialise.** The order tracking token sits in the URL
(`/track/<uuid>`), so I checked whether it escapes to third parties:
```
loaded /track/62afc70b… and logged every cross-origin request's Referer:
  fonts.googleapis.com   Referer: https://forno-pizza-shop.forno-pizza-dev.workers.d
  fonts.gstatic.com      Referer: https://fonts.googleapis.com/
  supabase.co            Referer: https://forno-pizza-shop.forno-pizza-dev.workers.d
verdict: no token leaked in any Referer header
```
The browser default (`strict-origin-when-cross-origin`) strips the path already. So this is
defence-in-depth, not an active leak — but it depends on a browser default rather than on anything
the app states.

### L-2. Tracking tokens never expire

**How I proved it:** `orders` has no expiry column, and `get_order_by_token` filters on
`o.access_token = p_access_token` alone. A token issued today still returns the order's
`customer_name`, `customer_phone`, `delivery_address` and `delivery_notes` indefinitely.

**Real-world impact:** a tracking link forwarded in a family WhatsApp group, or left in a shared
browser's history, remains a permanent read-only window onto that customer's name, phone number and
home address. The token is unguessable, so this is only a risk once a link is shared — but customers
share tracking links routinely, and nothing ages them out.

### L-3. Application errors are logged to the browser console

**How I proved it:** `grep -rnE "console\.(log|debug|info|warn|error|trace)" src/` →
2 hits, `src/pages/Checkout.jsx:162` and `src/pages/Menu.jsx:40`, both
`console.error('…', error)` passing the raw Supabase error object.

**Real-world impact:** minor information disclosure — Postgres error codes and internal function
names surface in the console of any customer who opens developer tools. No credentials are exposed.
(The 21 `console.error` / 17 `console.warn` / 4 `console.log` in the production bundle come from
React, react-router and supabase-js, not from this codebase.)

### L-4. A real email address is committed to a public repository

**How I proved it:** `supabase/chef.sql:303` contains
`v_chef_email constant text := 'forno.chef.test@gmail.com';`, while its sibling
`supabase/seed_staff.sql:21-22` uses `REPLACE_WITH_MANAGER_EMAIL` placeholders. The GitHub
repository is public.

**Real-world impact:** address harvesting and targeted phishing against a known staff account. It is
a throwaway test address, so the practical impact is spam — but the asymmetry with `seed_staff.sql`
means this was an exception made for convenience, not a decision.

### L-5. A user-facing error takes 5–8 seconds to appear when Supabase is unreachable

**How I proved it:** blocked `*supabase.co*` at the browser level and sampled the screen over time:
```
t= 3s  attempts: 2  screen: "Loading…"
t= 8s  attempts: 4  screen: "We could not reach the kitchen  Something went wrong…"
t=35s  attempts: 4  screen: (unchanged, retry button present)
```
**Real-world impact:** the handling is correct and a retry is offered — my first probe wrongly
called this a permanent hang because it only waited 6 seconds. The finding is that for the first
several seconds of an outage the customer sees an indistinguishable "Loading…", which on a slow
connection is where people give up and phone instead.

### L-6. Operational SQL is accumulating in `supabase/`

**How I proved it:** `ls supabase/*.sql` → 36 files, of which 11 are scaffolding
(`verify_*`, `checks`, `cleanup_test_data`, `clear_open_test_orders`, `mutation_test_oversell`,
`fix_order_number`, `reset_stock`, `go_live_reset`, and now `audit_repair`).

**Real-world impact:** no security impact. But `mutation_test_oversell.sql` deliberately installs a
**broken, overselling** `deduct_order_stock`, and its own header says "DO NOT LEAVE THIS APPLIED".
Nothing in the repo distinguishes files that are safe to run from files that will break the shop.
A new developer running the wrong one causes real overselling.

---

## Verified secure — attacks that were attempted and failed

An audit that lists only problems is not evidence of anything. These are the attacks that were run
and repelled.

### V-1. Row Level Security — anonymous client fully locked out

Every private table was attacked directly with the anon key. All ten were refused **at the grant
layer, before RLS was even consulted**:

```
anon select * from orders                 -> DENIED  permission denied for table orders
anon select * from order_items            -> DENIED  permission denied for table order_items
anon select * from order_item_toppings    -> DENIED  permission denied
anon select * from order_status_history   -> DENIED  permission denied
anon select * from ingredients            -> DENIED  permission denied for table ingredients
anon select * from recipes                -> DENIED  permission denied for table recipes
anon select * from stock_alerts           -> DENIED  permission denied for table stock_alerts
anon select * from stock_movements        -> DENIED  permission denied
anon select * from staff                  -> DENIED  permission denied for table staff
anon select * from reviews                -> DENIED  permission denied for table reviews
```
Writes fared no better — `update ingredients set stock_quantity = 999999`,
`insert into staff (role: 'admin')` (self-promotion), `delete from orders`,
`update orders set status`, `insert into stock_alerts`, `insert into stock_movements`,
`update menu_items set is_active = false` and `insert into reviews` for someone else's order were
**all refused**. Confirmed afterwards that nothing moved: Beef Strips `8000 -> 8000 UNCHANGED`,
order A `still exists, status = placed`.

Only `menu_items`, `menu_item_sizes`, `toppings` and `shop_settings` are readable anonymously,
which is required — that is the menu.

### V-2. Cross-customer isolation holds

Signed in as customer A, holding customer B's real order UUID and order number:
```
A: select orders where id = B's uuid          -> EMPTY (RLS filtered, 0 rows)
A: select orders where order_number = 1004    -> EMPTY
A: select order_items where order_id = B      -> EMPTY
A: update orders set status on B's order      -> DENIED
A: delete B's order                           -> DENIED
```
A's own baseline read returned exactly `#1000, #1003` — its own two orders — proving the query
itself worked and it was the *filter*, not a broken request, that returned nothing.

### V-3. Role separation is enforced in the database, not the UI

Every capability was invoked directly over the API by every role, bypassing the interface entirely:

| Function | anon | customer | manager | chef | admin |
|---|---|---|---|---|---|
| `admin_orders` | denied | `not_admin` | `not_admin` | `not_admin` | **allowed** |
| `admin_order_detail` | denied | `not_admin` | `not_admin` | `not_admin` | **allowed** |
| `admin_menu_items` | denied | `not_admin` | `not_admin` | `not_admin` | **allowed** |
| `admin_save_menu_item` | denied | `not_admin` | `not_admin` | `not_admin` | **allowed** |
| `admin_save_menu_size` | denied | `not_admin` | `not_admin` | `not_admin` | **allowed** |
| `admin_delete_menu_size` | denied | `not_admin` | `not_admin` | `not_admin` | **allowed** |
| `admin_active_orders` | denied | `not_staff` | **allowed** | `not_staff` | **allowed** |
| `sales_report` | denied | `not_staff` | **allowed** | `not_staff` | **allowed** |
| `staff_ingredients` | denied | `not_staff` | **allowed** | `not_staff` | **allowed** |
| `staff_ingredient_usage` | denied | `not_staff` | **allowed** | `not_staff` | **allowed** |
| `receive_stock` | denied | `not_manager` | **allowed** | `not_manager` | `not_manager` |
| `chef_orders` | denied | `not_kitchen` | `not_kitchen` | **allowed** | **allowed** |
| `set_order_status` | denied | `not_kitchen` | `not_kitchen` | **allowed** | **allowed** |

**A Manager cannot reach a single Admin capability, and an Admin cannot add stock** — `receive_stock`
refuses `is_admin()` on purpose (`supabase/receive_stock.sql:44`, "FR-7.6 lives on this line").
Separation is genuine and bidirectional.

### V-4. Concurrency — no oversell at the boundary

Rather than editing stock directly, the shelf was drained through ordinary orders until exactly one
was left, then two orders were fired simultaneously with `Promise.all`:

```
measured: 1 order consumes 2 Chicken Fillet
BOUNDARY REACHED: Chicken Fillet = 2 pcs — exactly enough for 1 order

firing TWO simultaneous orders for the last one...
  order 1: ACCEPTED #1026
  order 2: REFUSED  item_unavailable

  Chicken Fillet: 2 -> 0
  succeeded: 1   refused: 1
  VERDICT: PASS — exactly one order took the last stock, no oversell
```
Stock never went negative. The `for update` row lock does what it claims.

### V-5. Sold-out propagates to every affected item, not just the one ordered

The concurrency test left Chicken Fillet at 0. **Both** items that use it flipped — including
`Fiery Fillet Burger`, which was never ordered during this audit:
```
AUDIT-PROBE-RENAME       out_of_stock=true
Fiery Fillet Burger      out_of_stock=true      <- never touched
(all 15 other items      out_of_stock=false)
ordering the drained burger: REFUSED item_unavailable
```
The flag is not cosmetic — the database refuses the order too.

### V-6. Order totals are computed server-side and cannot be tampered with

`place_order` takes **no price parameter at all** — only `size_id`, `quantity` and `topping_ids`:
```
control: honest order                 -> ACCEPTED total=Rs820  (menu price Rs 820)
inject p_total = 1                    -> REJECTED  Could not find the function
inject p_subtotal/p_delivery_fee      -> REJECTED  Could not find the function
inject unit_price/line_total/price
  into the line item                  -> ACCEPTED  total=Rs820  (injected fields ignored)
```
Price tampering is not merely rejected, it is structurally impossible: there is no parameter to
carry a price.

### V-7. No SQL injection

```
name = ' OR 1=1 --                 -> stored as data, order total unchanged
name = '; DROP TABLE orders;--     -> stored as data, orders table intact
phone = '; SELECT pg_sleep(5)--    -> REJECTED invalid_phone
quantity = -5                      -> REJECTED item_unavailable
quantity = 0 / 999999              -> REJECTED item_unavailable
quantity = 1.5                     -> REJECTED invalid input syntax for integer
size_id = random uuid              -> REJECTED item_unavailable
items = [] / null                  -> REJECTED empty_cart
fulfillment = 'free'               -> REJECTED invalid_fulfillment_type
```

### V-8. No stored XSS — proved by execution, not by assumption

A live payload was stored as a customer name and then rendered on both the customer-facing and
staff-facing screens:
```
payload: <img src=x onerror="window.__XSS_FIRED=true">
stored verbatim on order #1020

CUSTOMER TRACKING PAGE:   XSS fired? no   <img> in DOM? no — escaped to text
ADMIN ORDERS LIST:        XSS fired? no   <img> in DOM? no — escaped
                          payload visible as literal text: yes (correct)
```
`grep -rnE "dangerouslySetInnerHTML|innerHTML|document\.write|eval\(|new Function" src/` returns
nothing: React's escaping is the only renderer in the application.

### V-9. Order-number guessing and token forgery both fail

```
anon get_order_by_token("1003" as uuid)   -> DENIED  invalid input syntax for type uuid
anon get_order_by_token(all-zero uuid)    -> EMPTY
anon get_order_by_token(random uuid)      -> EMPTY
anon submit_review, random token          -> DENIED  order_not_found
B  submit_review using A's token          -> DENIED  order_not_delivered
anon cancel_order, random token           -> DENIED  order_not_found
anon set_order_status on A                -> DENIED  permission denied for function
customer set_order_status on own order    -> DENIED  not_kitchen
```
Order numbers are sequential and guessable (#1003, #1004, #1005) but are **not** a credential —
they are a `text` column, and every read path demands the `uuid` access token instead. A valid token
does return the order, including phone and address; that is the documented design of a guest
tracking link, and the token is never echoed back in any response (`access_token` is stripped from
`get_order_by_token`, `admin_order_detail` and `place_order`'s order block).

### V-10. Secrets have never been committed

```
git log --all -- .env                          -> no history: never tracked
git log --all --diff-filter=A --name-only      -> only .env.example
git grep -E "eyJ[A-Za-z0-9_-]{30,}|service_role|-----BEGIN .* PRIVATE KEY" $(git rev-list --all)
                                               -> no matches across 416 objects
git grep -l "<the live anon key>" $(git rev-list --all)
                                               -> no matches
```
A planted JWT was used as a positive control to prove the scanner actually matches
(`matches on a planted JWT: 1`).

`.gitignore` contains `.env` in 11 of 12 commits; the twelfth is GitHub's initial commit, which
contains only `README.md` and `.gitattributes` and therefore could not have leaked anything. The
live anon key is in `sb_publishable_…` format, which is designed for client exposure.

### V-11. A brand-new account is powerless

```
own orders (should work, empty)     -> ALLOWED -> []
staff_role()                        -> ALLOWED -> null
staff_ingredients                   -> DENIED not_staff
admin_orders                        -> DENIED not_admin
chef_orders                         -> DENIED not_kitchen
receive_stock                       -> DENIED not_manager
sign in with a WRONG password       -> correctly refused (Invalid login credentials)
```

### V-12. Error handling is present at every call site

All 27 `supabase.rpc(...)` / `supabase.from(...)` call sites in `src/` reference `error`; none
ignore it. With Supabase fully blocked the app surfaces *"We could not reach the kitchen — Something
went wrong loading the shop details. Please try again."* with a working retry (see L-5 for the
delay).

### V-13. Code hygiene

- **No orphaned modules.** 116 source modules scanned against 142 distinct import specifiers,
  counting dynamic `lazy(() => import(...))` — every module has at least one importer.
  (A naive static-only scan reports 17 false orphans; the staff pages are all dynamically imported.)
- **No `debugger`, `TODO`, `FIXME`, `HACK` or `XXX`** anywhere in `src/`, `tests/` or `supabase/`.
- **`oxlint` and `prettier --check` both pass clean.**
- Only 2 `console.*` statements in application code (see L-3).

### V-14. The live site is exactly what `main` builds

```
origin/main   : ab72ffb
live bundle   : assets/index-Cr-_tP1L.js
rebuilt main  : assets/index-Cr-_tP1L.js
MATCH — live is exactly what main builds
```
Not a stale cache: the content hash of a fresh local build of `origin/main` is byte-identical to
what Cloudflare is serving. All 46 built assets return 200, and all 16 deep links tested — including
`/admin/orders/some-id`, `/track/<uuid>` and an invented path — return 200 serving the app shell,
confirming the SPA fallback in `wrangler.toml` is in force.

---

## Summary

| Severity | Count |
|---|---|
| **CRITICAL** | **0** |
| **HIGH** | **1** (unverified — needs dashboard access to confirm or dismiss) |
| **MEDIUM** | **4** |
| **LOW** | **6** |
| **SCOPE-CREEP** | **1** (L-6, operational SQL clutter — no security impact) |
| *Verified secure* | *14 attack classes attempted and repelled* |

### Plain-English verdict

**The security core of this application is genuinely solid, and it is close to client-ready — but
not today, because of housekeeping rather than architecture.**

The things that usually sink a project like this are all correct here, and I confirmed each by
attacking it rather than reading it. An anonymous visitor cannot touch a single private table. One
customer cannot see another's order even holding its exact UUID. A Manager cannot reach any Admin
function and an Admin cannot add stock, enforced in Postgres where it counts — if the UI were
deleted entirely, the permissions would still hold. Prices cannot be tampered with because the
browser is never asked for one. Two simultaneous orders for the last item produced exactly one sale
and zero overselling. A live XSS payload rendered as inert text on both the customer and staff
screens. Nothing secret has ever been committed. The deployed site is provably the code on `main`.

What blocks handover, specifically:

1. **The damage this audit caused must be repaired** — run `supabase/audit_repair.sql`, then
   `supabase/go_live_reset.sql`. Until the first one runs, a menu item is misnamed, Chicken Tikka has
   no Medium size, and the test suite is red.
2. **H-1 must be closed out** — five minutes in the Supabase dashboard to confirm the Redirect URLs
   allow-list is not open. It is likely fine; it cannot be *assumed* fine, and if it is open it is the
   one finding here that leads to account takeover.
3. **M-2 should be fixed before real staff use the panels** — adding `X-Frame-Options: DENY` (or a
   CSP `frame-ancestors 'none'`) is a few lines in `wrangler.toml` and removes the only practical
   attack against a signed-in Admin that this audit found.

M-1, M-3, M-4 and the LOW findings are worth scheduling but none of them should stop a launch.

**One caveat on scope:** this audit covered the application, its database and its deployment. It did
not cover the Supabase project's own dashboard configuration (auth settings, redirect allow-list,
rate limits, backups), because that is not reachable from outside. H-1 exists precisely because of
that boundary, and someone with dashboard access should review those settings independently.
