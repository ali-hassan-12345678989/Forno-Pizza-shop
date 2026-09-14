# Part 1 of 4 — Foundation & Setup
*(Test plan: $0 cost — Render + Supabase free tiers, no domain purchase yet)*

**Goal:** Get the infrastructure and data model in place, at zero cost, so every other part has something solid to build on. Nothing customer-facing yet — this is the plumbing.

## Tech stack (decided)
- **Frontend:** React, set up with Vite (`npm create vite@latest`) — not Create React App, which is no longer the maintained standard
- **Backend:** No custom server needed for most of this project — Supabase provides auth, database, and Postgres functions (called directly from React via `supabase.rpc(...)`) for logic like the atomic stock deduction in Part 3
- **Hosting:** Render **Static Site** (not Web Service) — since a Vite/React app builds to static files, this avoids the free Web Service's 15-minute spin-down entirely. Static sites don't sleep.

## Tasks

- [ ] **Skip buying a domain for now.** Use the free subdomain your host gives you (e.g. `forno.onrender.com`) — it comes with free HTTPS automatically, no cost, no setup.
- [ ] Create a Render account (Free tier — no credit card required), and create a **Static Site** service (not Web Service) connected to your git repo
- [ ] Create a Supabase account (Free tier — includes Postgres + Auth)
- [ ] ⚠️ **Use Supabase for the database, not Render's free Postgres** — Render's free database auto-deletes itself 30 days after creation with no warning grace beyond 14 days. Supabase's free database doesn't have a fixed deletion date; it only pauses after 7 days of total inactivity, and un-pauses with one click.
- [ ] Design and create the database schema in Supabase:
  - `menu_items` (name, description, image, active/sold-out flag)
  - `menu_item_sizes` (size, price, per item)
  - `ingredients` (name, unit, current stock quantity, low-stock threshold)
  - `recipes` (menu_item + size → ingredient → quantity consumed) — the BOM
  - `users` (optional accounts — Supabase Auth handles this)
  - `orders` (customer info, fulfillment type, status, totals, timestamps)
  - `order_items` (order → menu item, size, quantity, price)
  - `order_status_history` (order → status → timestamp, for the tracker)
  - `reviews` (menu item reviews + order/delivery reviews, rating, text)
  - `stock_alerts` (ingredient, triggered_at — for low-stock notices)
- [ ] Set up Supabase Auth (email/password or phone) for optional account creation
- [ ] Confirm guest checkout works without an account (no forced login)
- [ ] Basic project scaffolding: React + Vite app initialized, Supabase JS client configured
- [ ] Enable Row Level Security (RLS) on every Supabase table from the start — this is what actually protects your data, since the public/anon key is visible in the browser by design with this architecture
- [ ] Environment variables configured (Supabase URL + anon key only — no payment gateway keys needed for this plan)

## Depends on
Nothing — this is the starting point.

## Done when
- Render gives you a live `*.onrender.com` URL over HTTPS, for $0, serving your React app
- The Supabase database is reachable and all tables above exist, with RLS enabled
- You can manually insert a test menu item + ingredient + recipe row and query them back
- A test account can be created via Supabase Auth, and a guest session works without one

## Engineering Standards (apply throughout this part)
- **Test each task as you build it** — after each item in the checklist above, verify the flow, the code, and the actual implementation before moving to the next. Don't stack several untested pieces and debug them all at once.
- **Full retest at the end of this part** — once every task is checked off, re-test the whole part together end-to-end, as if for the first time. This catches things per-task testing alone misses.
- **Architecture:** clean separation between frontend and backend, a straightforward schema (no premature abstraction, no tables "just in case"). Build for what a single test shop actually needs, not hypothetical future scale.
- **Security:** never commit secrets — Supabase keys live in environment variables only. Enable Row Level Security (RLS) on Supabase tables from the start, not as an afterthought once data already exists.
- **Keep it simple:** this part is configuration, not clever engineering. If a setting or default does the job, don't build a custom version of it.

## Realistic time estimate
**Light — 2 to 3 days.** Mostly account setup and configuration, not building.

## Know before you build
- Static sites on Render don't spin down or sleep — unlike free Web Services, your test site stays instantly responsive with no wake-up delay.
- This entire part costs $0. When this stops being a test and goes live for real, the upgrade path is: buy a real domain (~$10/year) and point it at your Render Static Site (still free, or a small paid plan for extra bandwidth if needed) — Supabase can often stay on its free tier a while longer. Nothing here needs to be rebuilt — just upgraded.
