# Part 2 of 4 — Customer Ordering Flow
*(Cash on delivery/pickup only — no payment gateway)*

**Goal:** A customer can land on the site, browse the menu, build a cart, check out as a guest or with an account, and pay by cash — end to end. Runs entirely on the free Cloudflare + Supabase setup from Part 1.

## Tasks

- [ ] Homepage: hero, delivery/pickup toggle, address input
- [ ] Menu page: pull items from `menu_items` + `menu_item_sizes`, show price per size
- [ ] Size selection + "Add to cart" (client-side cart state)
- [ ] Cart view: line items, quantities, subtotal
- [ ] Checkout: name, phone, delivery address (or pickup confirmation), optional delivery notes
- [ ] Guest checkout by default — account creation offered, never forced
- [ ] Payment: cash only, on delivery or at pickup — no gateway to integrate, nothing to configure
- [ ] On order confirmation, write to `orders` + `order_items`
- [ ] Order confirmation screen (order number, summary, estimated time)
- [ ] Generate a unique order number/tracking link on confirmation — this is how a **guest** finds their order again after closing the browser (no account needed)
- [ ] Order history page for **logged-in** customers, listing their past orders
- [ ] Form validation: required fields checked before submit, inline error messages

## Reference (from the PRD)
FR-1.1 to FR-1.7 (ordering), FR-2.1 to FR-2.2 (cash payment)

## Depends on
Part 1 (database schema and hosting must exist)

## Done when
- A test customer can go from homepage → menu → cart → checkout → confirmation, fully as a guest, choosing cash on delivery or pickup
- The same flow also works logged in
- A completed order appears correctly in the `orders` table with the right total and items
- Required fields block submission with visible errors when left empty
- A guest can close the browser, return later with just their order number/link, and see their order
- A logged-in customer can see a list of their past orders

## Engineering Standards (apply throughout this part)
- **Test each task as you build it** — after building the menu page, test it before moving to cart; after cart, test it before checkout; and so on. Each flow, its code, and its behavior, verified before you move on.
- **Full retest at the end of this part** — once everything above is done, run the entire guest and logged-in ordering flows again end-to-end, as a real customer would.
- **Architecture:** keep cart state simple (client-side is fine at this scale), recompute the order total server-side on submit — never trust a price sent from the browser.
- **Security:** validate and sanitize every checkout field server-side (not just in the form), use parameterized queries only, and rate-limit order submission to prevent basic abuse.
- **Keep it simple:** this is a standard cart-and-checkout flow. Resist the urge to add cleverness (dynamic pricing rules, complex cart logic) that nobody asked for.

## Realistic time estimate
**Light–medium — 4 to 5 days.** This used to be the heaviest part of the whole project when it included payment gateway integration. With cash-only, it's now standard, well-understood work — no external service to fight with, no API keys, no webhook debugging.

## Note
Adding an online payment gateway later is a contained addition — a new payment method option plus one integration — it does not require reworking anything else built in this part.
