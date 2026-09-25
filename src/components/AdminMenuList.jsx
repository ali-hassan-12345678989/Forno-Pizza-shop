import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { COPY } from '../content/copy'
import { IMAGE_SIZES, sizedImage } from '../content/images'
import { STAFF_ROLES } from '../config/staff'
import { SECTION_IDS, detailPath } from '../config/staffNav'
import { MENU_STATUS, statusOf } from '../lib/menuAvailability'
import { formatPrice } from '../lib/format'
import './AdminMenu.css'
import SearchField from './SearchField'

/** The filters, and what each one keeps. Named so no call site spells one. */
const FILTERS = {
  all: () => true,
  live: (status) => status === MENU_STATUS.live,
  hidden: (status) => status === MENU_STATUS.hidden,
  soldOut: (status) => status === MENU_STATUS.soldOut || status === MENU_STATUS.outOfStock,
}

/**
 * FR-7.2, the index half: every item at a glance.
 *
 * A list to scan, not a stack of forms. The photo, the price and the status are
 * what tell an item apart, so those are what a row carries; everything else is
 * one click away in the editor. Inactive items are here too — a hidden item is
 * exactly the one most likely to need editing, and the customer-facing
 * fetchMenu() is what keeps them off the menu.
 */
export default function AdminMenuList({ items }) {
  const t = COPY.staff.menu

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const searchId = useId()

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const keep = FILTERS[filter] ?? FILTERS.all

    return items.filter((item) => {
      if (!keep(statusOf(item))) return false
      if (!needle) return true
      return `${item.name} ${item.category}`.toLowerCase().includes(needle)
    })
  }, [items, query, filter])

  if (items.length === 0) return <p className="amenu-empty">{t.empty}</p>

  return (
    <div className="amenu">
      <div className="amenu-controls">
        <SearchField id={searchId} label={t.searchLabel} value={query} onChange={setQuery} />

        <div className="amenu-filters" role="group" aria-label={t.filterLabel}>
          {Object.keys(FILTERS).map((key) => (
            <button
              key={key}
              type="button"
              className="chip"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {t.filters[key]}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 && <p className="amenu-empty">{t.noMatch}</p>}

      {shown.length > 0 && (
        <>
          <ul className="amenu-list">
            {shown.map((item) => (
              <MenuRow key={item.id} item={item} />
            ))}
          </ul>

          {shown.length < items.length && (
            <p className="amenu-showing">{t.showing(shown.length, items.length)}</p>
          )}
        </>
      )}
    </div>
  )
}

function MenuRow({ item }) {
  const t = COPY.staff.menu
  const status = statusOf(item)
  const image = sizedImage(item.imageUrl, IMAGE_SIZES.adminThumb)

  const prices = item.sizes.map((size) => size.price)
  const price = prices.length
    ? t.priceRange(formatPrice(Math.min(...prices)), formatPrice(Math.max(...prices)))
    : t.noPrice

  const meta = [
    item.category,
    item.sizes.length ? t.sizeCount(item.sizes.length) : t.noSizesYet,
    item.orderCount > 0 ? t.orderedTimes(item.orderCount) : t.neverOrdered,
  ].filter(Boolean)

  return (
    <li>
      {/* The whole row is the link, so the target is a row rather than a word. */}
      <Link
        className="amenu-row"
        to={detailPath(STAFF_ROLES.admin, SECTION_IDS.menu, item.id)}
        aria-label={t.openItem(item.name)}
      >
        <span className="amenu-thumb">
          {image ? <img src={image} alt="" width="46" height="46" loading="lazy" /> : null}
        </span>

        <span className="amenu-id">
          <strong>{item.name}</strong>
          <span className="amenu-meta">{meta.join(' · ')}</span>
        </span>

        <span className="amenu-price">{price}</span>

        <span className={`amenu-pill ${status}`}>{t.statuses[status]}</span>

        <svg className="amenu-chev" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <path
            d="M6 3l5 5-5 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </li>
  )
}
