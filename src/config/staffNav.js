import { ROUTES, sectionPath } from './routes'
import { STAFF_ROLES } from './staff'

/**
 * Every section id, so no call site spells one as a string. A typo becomes an
 * undefined import rather than a link that quietly goes nowhere.
 */
export const SECTION_IDS = {
  dashboard: 'dashboard',
  stock: 'stock',
  sales: 'sales',
  orders: 'orders',
  menu: 'menu',
  inventory: 'inventory',
  usage: 'usage',
  kitchen: 'kitchen',
  reports: 'reports',
}

/**
 * What each panel is made of.
 *
 * One entry per section, in the order it appears in the sidebar. `path` is the
 * child-route fragment — empty for the dashboard, which is the index route.
 * `label` keys into COPY.staff.nav so no wording lives here, and `icon` keys
 * into StaffIcons.
 *
 * Kept deliberately short. Shopify's own guidance is to use the fewest
 * categories that describe the tool; past seven items a sidebar starts hiding
 * things behind a "more" control, and a Manager with three jobs does not need
 * seven doors.
 */
/**
 * The route param a section's detail view is addressed by, and the id that
 * stands for "not saved yet". Both are read back with useParams(), so keeping
 * them here means neither the route nor the page spells one as a literal.
 * A real record id is a uuid, so NEW_RECORD_ID can never collide with one.
 */
export const DETAIL_PARAM = 'recordId'
export const NEW_RECORD_ID = 'new'

export const STAFF_NAV = {
  [STAFF_ROLES.manager]: [
    { id: SECTION_IDS.dashboard, path: '', icon: 'dashboard' },
    // The badge is the count of ingredients needing attention — the one thing
    // a Manager wants to know without opening anything.
    { id: SECTION_IDS.stock, path: 'stock', icon: 'stock', badge: 'lowStock' },
    // Both panels carry it: the Manager reads it against deliveries, the
    // Admin against the sales report. One screen, one function, two doors.
    { id: SECTION_IDS.usage, path: 'usage', icon: 'stock' },
    { id: SECTION_IDS.sales, path: 'sales', icon: 'sales' },
  ],
  /* One section, which is the panel. A kitchen does one thing, and a sidebar
     offering a single door is still worth having: it names where you are and
     carries the sign-out. */
  [STAFF_ROLES.chef]: [{ id: SECTION_IDS.kitchen, path: '', icon: 'orders' }],
  [STAFF_ROLES.admin]: [
    { id: SECTION_IDS.dashboard, path: '', icon: 'dashboard' },
    // Opens one order on its own URL, so a support call can be answered
    // from a link rather than by describing which row to scroll to.
    {
      id: SECTION_IDS.orders,
      path: 'orders',
      icon: 'orders',
      badge: 'openOrders',
      detail: `:${DETAIL_PARAM}`,
    },
    // One item opens on its own URL, so the back button, a refresh and a
    // bookmark all land on the item the Admin was editing.
    { id: SECTION_IDS.menu, path: 'menu', icon: 'menu', detail: `:${DETAIL_PARAM}` },
    { id: SECTION_IDS.inventory, path: 'inventory', icon: 'stock' },
    { id: SECTION_IDS.usage, path: 'usage', icon: 'stock' },
    { id: SECTION_IDS.reports, path: 'reports', icon: 'sales' },
  ],
}

/** Where each role's panel lives. */
export const PANEL_ROOT = {
  [STAFF_ROLES.manager]: ROUTES.manager,
  [STAFF_ROLES.admin]: ROUTES.admin,
  [STAFF_ROLES.chef]: ROUTES.chef,
}

/** The badge sources a nav entry may ask for, so a typo is an import error. */
export const BADGE_SOURCES = {
  lowStock: 'lowStock',
  openOrders: 'openOrders',
}

export function navFor(role) {
  return STAFF_NAV[role] ?? []
}

/**
 * Absolute path of one section, found by id.
 *
 * Lets a page link to a sibling section without knowing its URL fragment —
 * the fragment stays defined once, in the table above.
 */
export function pathTo(role, sectionId) {
  const item = navFor(role).find((section) => section.id === sectionId)
  return sectionPath(PANEL_ROOT[role], item?.path ?? '')
}

/**
 * Absolute path of one record inside a section that opens records.
 *
 * Returns null when the section has no detail view, so a caller cannot invent
 * a URL the route table does not serve.
 */
export function detailPath(role, sectionId, recordId) {
  const section = navFor(role).find((item) => item.id === sectionId)
  if (!section?.detail) return null
  return `${sectionPath(PANEL_ROOT[role], section.path)}/${recordId}`
}

/** Where "Add an item" goes: the same detail view, with nothing in it yet. */
export function newRecordPath(role, sectionId) {
  return detailPath(role, sectionId, NEW_RECORD_ID)
}
