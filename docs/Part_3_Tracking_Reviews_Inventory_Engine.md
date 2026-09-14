# Part 3 of 4 — Tracking, Reviews & Inventory Engine

**Goal:** Once an order is placed (Part 2), the system should track it visibly, automatically manage stock behind the scenes, and let customers leave reviews. This is the trickiest part of the project — not because of any single screen, but because of the inventory math underneath.

## Tasks

**Order tracking**
- [ ] Order status field with 4 stages: Placed → Preparing → Out for delivery/Ready for pickup → Delivered/Picked up
- [ ] Tracking page showing current status, updates from `order_status_history`
- [ ] Cancel button, active only within the defined window (e.g. before "Preparing" starts)

**Inventory engine (the core automation — the genuinely hard part)**
- [ ] On order confirmation, look up each item's recipe (from `recipes`) and deduct ingredient quantities from `ingredients.stock`
- [ ] This deduction must be atomic — an order should never confirm if the stock update fails
- [ ] Handle concurrent orders correctly (two people ordering the last stock at once shouldn't oversell) — this is the single trickiest piece of engineering in the entire project; budget real time for it, don't rush it
- [ ] When an ingredient's stock crosses its low-stock threshold, log a `stock_alerts` row (displayed later to Manager/Admin in Part 4)
- [ ] When an ingredient hits zero, automatically flag every menu item that needs it as sold out (no manual step)
- [ ] Sold-out items visibly disabled on the customer menu (already built in Part 2's UI — just wire it to real data now)

**Reviews**
- [ ] Review form on menu items (rating + text)
- [ ] Review form on order/delivery experience (rating + text)
- [ ] Display reviews on the relevant menu item page

## Reference (from the PRD)
FR-3.1 to FR-3.4 (tracking/cancellation), FR-4.1 to FR-4.3 (reviews), FR-5.1 to FR-5.5 (inventory engine)

## Depends on
Part 1 (schema) and Part 2 (orders must be created for there to be anything to track/deduct against)

## Done when
- Placing a test order automatically reduces the correct ingredients by the correct recipe amounts
- Manually setting an ingredient to 0 stock causes the right pizza to show "Sold out" without touching any other code
- A low-stock threshold crossing creates a visible alert record
- Placing two test orders for the last unit of stock at the same time doesn't oversell it
- A customer can leave and see both types of reviews
- The tracker updates as status changes, and cancellation is blocked once outside the allowed window

## Engineering Standards (apply throughout this part)
- **Test each task as you build it** — test the tracker before touching inventory deduction, test deduction on a single order before testing concurrency, test concurrency before moving to reviews. Each piece verified in isolation first.
- **Full retest at the end of this part** — once everything is built, re-run the full chain together: place an order, watch it deduct stock, watch the tracker update, leave a review, confirm sold-out triggers correctly.
- **Architecture:** use real database transactions for the stock deduction — this is exactly the kind of correctness problem transactions exist for. Don't hand-roll a workaround when the database already solves it.
- **Security:** make sure a customer can only cancel or view *their own* order (never trust an order ID alone without checking ownership), and that review submission can't be spoofed to an order that isn't theirs.
- **Keep it simple:** the concurrency handling deserves real care — that's not the same as making it complicated. A correct, well-tested transaction is simpler than a clever homemade locking scheme.

## Realistic time estimate
**Heaviest part of the project — 7 to 10 days.** The tracker and reviews are easy. The concurrency-safe stock deduction is where the time actually goes — it's the kind of bug that's invisible in normal testing and only shows up once real, simultaneous orders hit it. Worth taking slowly rather than rushing to move on.

## Know before you build
Supabase's free tier (500MB storage) is comfortably enough for this — a single test shop's order and ingredient data won't come close to that limit during testing.
