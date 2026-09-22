/**
 * Sidebar icons.
 *
 * Geometry only — every stroke takes its colour from `currentColor`, so the
 * rail's active and hover states are decided by CSS rather than by a second
 * copy of the palette living in path data.
 */

const base = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
}

function DashboardIcon() {
  return (
    <svg {...base}>
      <rect x="1.8" y="1.8" width="5" height="5" rx="1" />
      <rect x="9.2" y="1.8" width="5" height="5" rx="1" />
      <rect x="1.8" y="9.2" width="5" height="5" rx="1" />
      <rect x="9.2" y="9.2" width="5" height="5" rx="1" />
    </svg>
  )
}

function StockIcon() {
  return (
    <svg {...base}>
      <path d="M2 5.2 8 2l6 3.2v5.6L8 14l-6-3.2z" />
      <path d="M2 5.2 8 8.4l6-3.2M8 8.4V14" />
    </svg>
  )
}

function SalesIcon() {
  return (
    <svg {...base}>
      <path d="M2 13h12" />
      <path d="M4 11V7M7.3 11V4M10.7 11V8.4M14 11V5.6" />
    </svg>
  )
}

function OrdersIcon() {
  return (
    <svg {...base}>
      <path d="M3 2.5h10v11l-2-1.4-1.6 1.4L8 12.1 6.6 13.5 5 12.1 3 13.5z" />
      <path d="M5.6 6h4.8M5.6 8.7h3.2" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg {...base}>
      <circle cx="8" cy="8" r="6.1" />
      <path d="M8 1.9v12.2M1.9 8h12.2" />
    </svg>
  )
}

/** Keyed by the `icon` value in config/staffNav.js. */
export const STAFF_ICONS = {
  dashboard: DashboardIcon,
  stock: StockIcon,
  sales: SalesIcon,
  orders: OrdersIcon,
  menu: MenuIcon,
}

export function StaffIcon({ name }) {
  const Glyph = STAFF_ICONS[name]
  return Glyph ? <Glyph /> : null
}
