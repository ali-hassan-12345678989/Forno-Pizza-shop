/**
 * A stand-in for the Supabase client, for tests that care about rendering.
 *
 * The other 622 tests in this repo talk to a real Supabase project, and they
 * should — you cannot prove RLS holds or that two orders cannot oversell by
 * mocking the database. These tests answer a different question: does the
 * screen render at all? That question needs no network, and answering it over
 * the network would make the suite slow, flaky and destructive to real data.
 *
 * The shape is a chainable thenable because that is what PostgREST's builder
 * is: `.from().select().eq().order().abortSignal().single()` returns the
 * builder every time and only resolves when awaited. Mocking it any other way
 * means the mock breaks the first time someone adds a `.limit()`.
 */

/** One row per table, shaped exactly as the real columns are. */
const TABLES = {
  shop_settings: {
    id: 1,
    name: 'Forno',
    tagline: 'Wood-fired pizza',
    phone_display: '051 111 367 667',
    phone_e164: '+925111136766',
    address: 'F-7 Markaz, Islamabad',
    hours: 'Open daily 12pm – 11pm',
    delivery_eta: '25–35 min',
    pickup_eta: '15 min',
    delivery_fee: 150,
  },
  menu_items: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Chicken Tikka',
      description: 'Tikka chicken, onion, capsicum',
      image_url: null,
      is_sold_out: false,
      out_of_stock: false,
      is_active: true,
      category: 'pizza',
      badge: null,
      sort_order: 1,
      menu_item_sizes: [
        {
          id: '22222222-2222-2222-2222-222222222222',
          size: 'Medium',
          price: 1050,
          serves: 'Serves 2',
          sort_order: 1,
        },
      ],
      menu_item_toppings: [
        {
          toppings: {
            id: '33333333-3333-3333-3333-333333333333',
            name: 'Extra cheese',
            price: 150,
            sort_order: 1,
          },
        },
      ],
    },
  ],
  orders: [],
}

/**
 * One entry per RPC the UI calls. `null` where the screen handles an empty
 * answer, which several deliberately do — an empty kitchen is a normal state.
 */
const RPCS = {
  menu_review_summary: [],
  item_reviews: [],
  order_reviews: [],
  experience_summary: [{ review_count: 0, average_rating: null }],
  order_status_values: ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'],
  staff_role: null,
  chef_orders: [],
  admin_orders: [],
  admin_active_orders: [],
  admin_menu_items: [],
  admin_order_detail: null,
  staff_ingredients: [],
  staff_usage_between: [],
  staff_top_items: [],
  staff_cancelled_orders: [],
  sales_by_daypart: [],
  staff_stock_alerts: [],
  sales_report: [],
  get_order_by_token: null,
}

/** Chainable, thenable, and resolves to whatever the caller finally asked for. */
function builder(rows) {
  const result = () => ({
    data: Array.isArray(rows) ? rows : rows,
    error: null,
    count: Array.isArray(rows) ? rows.length : rows ? 1 : 0,
  })

  const chain = {
    // `.single()` and `.maybeSingle()` collapse the list the way PostgREST does,
    // so a component reading `data.name` gets an object and not an array of one.
    single: () =>
      Promise.resolve({ data: Array.isArray(rows) ? (rows[0] ?? null) : rows, error: null }),
    maybeSingle: () =>
      Promise.resolve({ data: Array.isArray(rows) ? (rows[0] ?? null) : rows, error: null }),
    // A deliberate thenable. PostgREST's builder is one — it is chainable
    // until awaited and only then resolves — so a mock that is not thenable
    // would fail on the very first `await supabase.from(...).select()`.
    // oxlint-disable-next-line unicorn/no-thenable
    then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
    catch: (fn) => Promise.resolve(result()).catch(fn),
    finally: (fn) => Promise.resolve(result()).finally(fn),
  }

  // Everything else on the builder returns the builder. A Proxy rather than a
  // list of method names, so a query that grows a new modifier keeps working
  // instead of failing with "x.limit is not a function".
  return new Proxy(chain, {
    get(target, prop) {
      if (prop in target) return target[prop]
      return () => builder(rows)
    },
  })
}

/** A session shaped like the one supabase-js hands back. */
const SESSION = {
  access_token: 'test-token',
  user: { id: '44444444-4444-4444-4444-444444444444', email: 'staff@example.test' },
}

/**
 * @param overrides.tables   extra or replacement table rows
 * @param overrides.rpcs     extra or replacement RPC answers
 * @param overrides.signedIn true to hand back a session
 * @param overrides.role     what staff_role() answers — drives StaffGate
 *
 * `signedIn` and `role` exist because the staff panels are otherwise untestable:
 * signed out, StaffGate redirects to the login page, so a test that mounts
 * /admin/menu is really only testing the login form. Handing it a session and a
 * role is what makes the panel itself render.
 */
export function makeMockSupabase(overrides = {}) {
  const tables = { ...TABLES, ...overrides.tables }
  const rpcs = { ...RPCS, ...overrides.rpcs }
  if (overrides.role !== undefined) rpcs.staff_role = overrides.role
  const session = overrides.signedIn ? SESSION : null

  return {
    from: (table) => builder(tables[table] ?? []),
    rpc: (name) => builder(name in rpcs ? rpcs[name] : []),
    auth: {
      getSession: () => Promise.resolve({ data: { session }, error: null }),
      getUser: () => Promise.resolve({ data: { user: session?.user ?? null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: () => Promise.resolve({ data: { session }, error: null }),
      signUp: () => Promise.resolve({ data: { session }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
    },
  }
}
