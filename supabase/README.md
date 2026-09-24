# What is safe to run in here, and what is not

Thirty-seven `.sql` files sit in this folder and nothing in their names says which
ones rebuild the shop, which ones wipe it, and which one **deliberately breaks it**.
The security audit flagged that as the one real hazard in this directory, so this
page is the label.

Read the group a file is in before you run it.

---

## ☠️ NEVER run this on a database anyone is using

| File | What it does |
|---|---|
| `mutation_test_oversell.sql` | **Installs a knowingly broken `deduct_order_stock()` that oversells.** It exists so `tests/concurrency.test.js` can be shown to fail — a concurrency test that has never failed is not evidence of anything. Its own header says "DO NOT LEAVE THIS APPLIED". |

**If it has been run:** re-run `deduct_stock.sql`. That is the entire fix, and it is
the first thing to try if stock starts going negative.

---

## ⚠️ Destructive — reads fine, writes are one-way

| File | What it destroys |
|---|---|
| `go_live_reset.sql` | **Every order, review and stock movement.** Puts the shop at zero for opening day and rewinds order numbers to #1000. Run once, before the first real customer. After real money has come through it deletes the shop's own records. |
| `cleanup_test_data.sql` | Test orders, returning their ingredients through `restore_order_stock()`. |
| `clear_open_test_orders.sql` | Open test orders only. |
| `reset_stock.sql` | Overwrites current stock levels with the opening figures. |
| `fix_order_number.sql` | Moves `order_number_seq`. Re-issues numbers customers already hold if any orders remain. |
| `audit_repair.sql` | One-shot. Undoes the menu damage the 2026-09-24 audit caused. Safe to re-run, pointless after the first time. |

---

## 🔧 Schema and logic — safe, idempotent, re-run whenever

`schema.sql`, `place_order.sql`, `deduct_stock.sql`, `order_status.sql`, `reviews.sql`,
`recipes.sql`, `toppings.sql`, `sold_out.sql`, `shop_settings.sql`, `receive_stock.sql`,
`staff_roles.sql`, `staff_inventory.sql`, `staff_alerts.sql`, `sales_report.sql`,
`active_orders.sql`, `admin_menu.sql`, `admin_orders.sql`, `stock_movements.sql`,
`chef.sql`

All `create or replace`. Running one twice does nothing the first run did not.

**One ordering trap.** `schema.sql` and `place_order.sql` both define
`get_order_by_token()`, and they are not the same function: the `place_order.sql`
version also returns each line's toppings, which it can only do once `toppings.sql`
has created `order_item_toppings_json()`. Re-running `schema.sql` on an established
database therefore **silently** drops every customer's extras from their tracking
page, with no error. If you re-run `schema.sql`, re-run `place_order.sql` after it.

**Two files need editing before they will run.** `seed_staff.sql` and `chef.sql` carry
`REPLACE_WITH_..._EMAIL` placeholders instead of real addresses, because this
repository is public and publishing the address a Manager signs in with hands over
half a credential for free. Put the addresses from `.env` in, then run.

---

## 🌱 Seeds — safe, but they overwrite edits

`seed_menu.sql`, `seed_recipes.sql`, `seed_test_data.sql`, `seed_staff.sql`

`on conflict do update`, so re-running resets prices, descriptions and recipe
quantities back to the seeded figures. Anything changed through the Admin panel
since is lost. `seed_recipes.sql` deliberately does **not** touch `stock_quantity`.

---

## ✅ Verification — read-only, run any time

`checks.sql`, `verify_order_status.sql`, `verify_recipes.sql`, `verify_reviews.sql`,
`verify_staff_alerts.sql`, `verify_staff_roles.sql`, `verify_stock.sql`

These raise an exception if something is wrong and otherwise print a report. Several
create and then remove their own fixtures inside a transaction, which is why they show
up in a search for `delete from` — they clean up after themselves and leave real data
alone.

---

## Building a database from nothing

```
schema.sql → seed_test_data.sql → shop_settings.sql → toppings.sql →
seed_menu.sql → recipes.sql → seed_recipes.sql → deduct_stock.sql →
place_order.sql → order_status.sql → sold_out.sql → reviews.sql →
staff_roles.sql → seed_staff.sql (edit first) → staff_inventory.sql →
staff_alerts.sql → receive_stock.sql → sales_report.sql → active_orders.sql →
admin_menu.sql → admin_orders.sql → stock_movements.sql → chef.sql (edit first)
```

`place_order.sql` after `schema.sql`, for the reason in the ordering trap above.

---

## Settings this folder cannot reach

Two things live only in the Supabase dashboard, and the audit could not verify either
from outside:

1. **Authentication → URL Configuration.** *Site URL* should be the live
   `workers.dev` origin, and *Redirect URLs* should list only that origin plus
   `http://localhost:5173/**`. A wildcard here means a password-reset link can be
   pointed at an attacker's site, handing them the reset token.
2. **Authentication → Providers → Email → Confirm email.** Currently **off**, so
   anyone can register with an address they do not own. That is a deliberate
   friction trade-off, not an oversight — but it should be a decision someone made
   on purpose, which is why it is written down here.
