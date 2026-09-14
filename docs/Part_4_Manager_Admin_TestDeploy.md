# Part 4 of 4 — Manager & Admin Panels + Test Deployment

**Goal:** Give the Manager and Admin their own tools, lock down access properly, and get a working test version live on your free `*.onrender.com` URL.

## Tasks

**Manager panel** (single account)
- [ ] Manager login (separate from customer accounts)
- [ ] Add-stock screen: select ingredient, enter quantity received, submit — updates `ingredients.stock`
- [ ] View current stock levels for all ingredients
- [ ] View active low-stock alerts (the alerts Part 3 logs to `stock_alerts` — this is where they actually get seen)
- [ ] View sales reports (orders + revenue) to cross-check against inventory usage
- [ ] Manager cannot access menu editing or admin-only settings

**Admin panel** (single account)
- [ ] Admin login (separate from Manager and customer accounts)
- [ ] Menu management: add/edit/remove items, sizes, prices, images, active status
- [ ] View count of current/active orders
- [ ] Sales reports: daily, monthly, yearly views
- [ ] View current inventory levels — **read-only**, no add/edit controls
- [ ] Admin cannot add or adjust stock quantities (that stays Manager-only)

**Access control**
- [ ] Role-based permissions enforced on the backend, not just hidden in the UI (a Manager hitting the Admin API directly should still be blocked)
- [ ] Separate login sessions for Customer / Manager / Admin

**Test deployment** *(not a real go-live yet — this is the $0 test plan)*
- [ ] Final cross-browser and mobile QA pass
- [ ] Real-ish menu content, prices, and recipe/BOM values loaded for testing (doesn't need to be final)
- [ ] Deploy to the free `*.onrender.com` URL — HTTPS is automatic, no DNS or SSL setup needed at this stage
- [ ] Smoke test: one full test order end-to-end on the live test URL, checked by both Manager and Admin views

## Reference (from the PRD)
FR-6.1 to FR-6.5 (Manager panel), FR-7.1 to FR-7.6 (Admin panel)

## Depends on
Parts 1–3 (the inventory engine and order data must already exist for these panels to have anything to manage or report on)

## Done when
- Manager can add stock and see it reflected instantly in ingredient levels
- A low-stock alert is actually visible on screen to the Manager (and/or Admin), not just sitting in the database
- Admin can edit the menu and see order/sales reports, but cannot touch stock
- Both panels are behind separate logins with backend-enforced permissions
- A full test order completes successfully on the live `*.onrender.com` test URL

## Engineering Standards (apply throughout this part)
- **Test each task as you build it** — test Manager's add-stock flow before starting Admin's menu editor; test Admin's menu editor before starting reports; test role-blocking as soon as both logins exist, not just at the end.
- **Full retest at the end of this part** — once both panels and access control are done, re-test the entire project together: a full customer order, followed by Manager and Admin checking it, on the deployed test URL.
- **Architecture:** two thin, separate panels reusing the same backend and data — no need for two separate codebases or duplicate logic between them.
- **Security:** enforce role checks on every backend route, not just by hiding buttons in the UI — assume someone will try hitting the Admin API directly as a Manager, and make sure it's actually blocked, not just hidden. No shared passwords between roles.
- **Keep it simple:** two single-user panels don't need a full permissions system with granular roles — a simple "is this the Manager / is this the Admin" check is enough for this scale. Don't build for staff accounts that don't exist yet.

## Realistic time estimate
**Medium — 4 to 6 days.** Lighter than a real go-live would be, since there's no domain, DNS, or SSL setup to do — Render's free subdomain handles HTTPS automatically. Most of the time here goes to the two panels' screens and making sure role permissions are actually enforced, not just hidden.

## When you're ready to go live for real
This test deployment doesn't need to be rebuilt — just upgraded: buy the domain and point it at your Render Static Site (still free, or a small paid plan only if bandwidth needs grow), and load the client's real menu/recipe data in place of test data.
