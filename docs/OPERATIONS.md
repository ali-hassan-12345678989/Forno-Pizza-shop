# Running the shop

What to do when something goes wrong, and what to check before it does.

The fourth audit found nothing in this repository answered any of it. Four audits had
hardened the code and nobody had written down how the thing is operated — which matters
more, on a day when the site is down and the shop is busy.

Some of this is a decision only you can make or check, because it lives in a dashboard this
repository cannot read. Those are marked **[CHECK]** and are listed together at the end.

---

## If the site is down

**First, find out which half.** They fail independently and the fix is different.

```bash
# Is the site itself serving?
curl -sI https://forno-pizza-shop.forno-pizza-dev.workers.dev/ | head -1

# Is the database answering?
curl -s -o /dev/null -w '%{http_code}\n' \
  "$VITE_SUPABASE_URL/rest/v1/shop_settings?select=name" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY"
```

| Site | Database | What it is |
|---|---|---|
| 200 | 200 | Not down. Look at one specific page or one specific account. |
| 200 | fails | Supabase. Check <https://status.supabase.com> — the shop shows an error screen with a retry, and the phone number in the header still works. |
| fails | 200 | Cloudflare, or a bad deploy. See rolling back, below. |
| fails | fails | Almost certainly the network between you and both. Ask someone else to load it. |

**The shop can still take orders by phone the whole time.** The number is in the header,
printed on the site, and the kitchen does not need the website to cook. Say so to staff
before they need to be told.

---

## Rolling back a bad deploy

Merging to `main` is the deploy — Cloudflare Workers Builds watches the branch. So the
rollback is a git operation, not a dashboard one.

```bash
git revert --no-edit <the-bad-commit>     # or -m 1 <merge-commit> for a merge
git push origin main
```

Cloudflare rebuilds and republishes in roughly two minutes. Watch for it:

```bash
curl -s https://forno-pizza-shop.forno-pizza-dev.workers.dev/ | grep -oE 'index-[A-Za-z0-9_-]+\.js'
```

The hash changes when the new build is live.

**Do not roll back by deleting commits and force-pushing.** A revert keeps the history
honest and can itself be reverted when the real fix lands.

**Customers with the app already open** ask for code chunks the new deploy has replaced.
That is handled: the error boundary recognises a stale chunk and offers "Reload the page",
and `index.html` is served uncached precisely so a reload picks up the new hashes. Their
cart survives, because it lives in their browser.

---

## Backups

**[CHECK] This is the single most important unanswered question about the shop.**

Everything that matters lives in one Supabase project: every order, the menu, the recipes,
the stock levels, the staff accounts. There is no second copy anywhere, and this repository
holds only the schema — not the data.

Losing it would undo more than four audits ever fixed.

**What to do, in Supabase → Database → Backups:**

1. Find out what the current plan actually retains. Free-tier backup policy changes, and
   what it was when the project was created is not necessarily what it is now.
2. If the answer is "nothing" or "less than you would want", that is the strongest argument
   for the paid tier in this whole project — stronger than any performance figure.

**A manual export, which works on any plan and takes a minute:**

```bash
# Requires the Supabase CLI and the database password (Project Settings -> Database)
supabase db dump --db-url "$SUPABASE_DB_URL" -f "forno-$(date +%F).sql"
```

Worth doing before every schema change, and worth doing on a schedule once the shop has
taken orders worth keeping. A dump on the laptop is not a backup strategy, but it is
enormously better than nothing.

**What is NOT at risk:** the code. It is on GitHub and on this machine, and the site can be
rebuilt from it in minutes. Only the data is irreplaceable.

---

## Knowing the shop is down before a customer tells you

**[CHECK] There is no monitoring.** If the site returns 500 at 8pm on a Friday, the first
signal is somebody phoning to ask why they cannot order.

The cheapest fix that actually works: a free uptime monitor hitting the home page every five
minutes, alerting by email or WhatsApp. UptimeRobot, Better Stack and Cloudflare's own
health checks all have free tiers that cover this.

Point it at `https://forno-pizza-shop.forno-pizza-dev.workers.dev/` and alert on anything
that is not a 200. Five minutes of setup, and it is the difference between finding out from
a monitor and finding out from a customer.

Worth adding when there is time: a second check against the Supabase REST URL, because the
site can be up while the database is not — and that combination looks fine to anyone
glancing at the home page.

---

## How long customer data is kept

**[CHECK] Today: forever.** Every order holds a name, a phone number and, for deliveries, a
home address. Nothing deletes them.

Tracking tokens expire after 30 days (the first audit's L-2), so an old link stops working —
but the row behind it stays.

That is a defensible position for a shop that wants its own sales history, and it is the
current state whether or not anyone chose it. The point of writing it down is that it should
be a choice.

If a retention rule is ever wanted, the shape is: keep the order and its money, clear the
personal columns after N months. `customer_name`, `customer_phone` and `delivery_address`
are the three columns involved; nothing in the reporting reads them, so the sales history
survives intact.

---

## Routine checks

| When | What |
|---|---|
| Before any schema change | Take a manual dump (above) |
| After any deploy | Confirm the asset hash changed, and load one page |
| Monthly | `npm audit` — currently 0 vulnerabilities |
| Monthly | `npm outdated` — patch and minor bumps are routine; majors deserve reading the changelog |
| Before a busy weekend | Check stock levels in Manager → Stock, and that nothing is unintentionally sold out |

---

## What runs automatically, and what does not

**Automatic:** the deploy. A push to `main` builds and publishes.

**Automatic since the fourth audit:** lint, formatting, the build, and the 245 tests that
need no database — on every push and every pull request, via
`.github/workflows/checks.yml`. A red check now blocks the merge button instead of
depending on somebody remembering.

**Still manual:** the 580 tests that place real orders. They talk to the live Supabase
project, so running them on every push would put a hundred orders into the shop. Run them
deliberately, from a machine with `.env`:

```bash
npx vitest run                 # everything, including the database tests
npx vitest run tests/ui        # the ones CI already covers
```

**After running the full suite against the live project, the shop needs resetting** — the
tests place real orders and consume real stock. `supabase/go_live_reset.sql` puts it back to
zero at #1000. That is why the full suite is not wired to CI, and why it should be run
before a release rather than casually.

The long-term answer is a second Supabase project for testing, with `.env.test` pointing at
it. Then the whole suite can run in CI and nothing ever touches the live shop. It is not
built yet; this file is the reminder that it is the right next step.

---

## The [CHECK] list, together

Three things this repository cannot answer for you:

1. **What does the Supabase plan back up, and for how long?** → Database → Backups
2. **Is anything watching the site?** → set up a free uptime monitor
3. **Is "keep customer data forever" the intended policy?** → currently yes, by default

The first is the one that would hurt.
