# Forno Pizza — Project Memory

This file is read automatically by Claude Code at the start of every session. It holds the decisions already made so they never need to be re-explained.

## What this project is
A single-location pizza shop ordering website — customer ordering, order tracking, reviews, plus separate Manager and Admin panels with an automated inventory (recipe/BOM) engine. Full requirements are in `docs/Pizza_Shop_Website_PRD.md`.

## Tech stack (decided — do not suggest alternatives without asking)
- **Frontend:** React, set up with Vite
- **Backend:** No custom server. Supabase provides the database, auth, and Postgres functions (called via `supabase.rpc(...)`) for logic like atomic stock deduction.
- **Database:** Supabase (free tier for now)
- **Hosting:** Cloudflare **Workers static assets** — the built React app is static files, so there are no cold starts. (Render was the original choice; it was dropped because its free tier now requires a credit card.)
- **Payment:** Cash on delivery/pickup only. No payment gateway in this version.
- **Domain:** None yet — the free `*.workers.dev` subdomain during testing. Live test URL: https://forno-pizza-shop.forno-pizza-dev.workers.dev

## Build order — follow this sequence, one part at a time
1. `docs/Part_1_Foundation_Setup.md` — database schema, Supabase Auth, RLS, project scaffolding
2. `docs/Part_2_Customer_Ordering_Flow.md` — build using `design-reference/Forno_Website.html` as the exact visual/interaction spec, wired to real Supabase data
3. `docs/Part_3_Tracking_Reviews_Inventory_Engine.md` — order tracker, reviews, and the inventory engine (heaviest part — the concurrency-safe stock deduction deserves real care)
4. `docs/Part_4_Manager_Admin_TestDeploy.md` — Manager + Admin panels, role enforcement via Supabase RLS, deploy to the test URL

**Do not start a later part until the current part's "Done when" checklist is genuinely satisfied.**

## Engineering standards (apply to everything, every part)
- Test each feature as it's built — the flow, the code, and the behavior — before moving to the next feature.
- Once a whole part's tasks are done, retest the entire part end-to-end again, as if for the first time.
- Enforce security at the database level: Row Level Security policies on every Supabase table, never trust client-side data alone (e.g. recompute order totals server-side / in a Postgres function).
- Keep it simple. This is a single-shop, single-Manager, single-Admin project — don't build for scale, multi-tenancy, or flexibility nobody asked for.
- Never invent scope. If something isn't in the relevant Part file or the PRD, ask before building it.

## Design
`design-reference/Forno_Website.html` is the approved, exact design — colors, layout, spacing, and interaction behavior. Treat it as a spec to match, not a rough idea to reinterpret.
