import { useCallback, useEffect, useState } from 'react'
import AdminMenuItem from './AdminMenuItem'
import { COPY } from '../content/copy'
import { fetchAdminMenu } from '../api/adminMenu'
import './AdminMenu.css'

/**
 * A brand-new item, before it has ever been saved.
 *
 * Hidden by default. An item is created with no sizes, and an active item with
 * no sizes is a card on the customer menu that cannot be ordered — so the
 * Admin adds the sizes first, then ticks "Show on the customer menu". Saving
 * cannot publish something broken by accident.
 */
const BLANK_ITEM = {
  id: null,
  name: '',
  description: '',
  imageUrl: '',
  category: '',
  badge: '',
  sortOrder: 0,
  isActive: false,
  isSoldOut: false,
  outOfStock: false,
  orderCount: 0,
  sizes: [],
}

/**
 * FR-7.2: add, edit and remove menu items.
 *
 * Shows inactive items too — a hidden item is exactly the one most likely to
 * need editing, and the customer-facing fetchMenu() filters them out.
 */
export default function AdminMenu() {
  const t = COPY.staff.menu

  const [items, setItems] = useState(null)
  const [errorCode, setErrorCode] = useState(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setErrorCode(null)
    const { items: next, errorCode: code } = await fetchAdminMenu()
    setItems(next)
    setErrorCode(code)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const changed = useCallback(() => {
    setAdding(false)
    load()
  }, [load])

  const hidden = items?.filter((i) => !i.isActive).length ?? 0

  return (
    <section className="amenu" aria-labelledby="amenu-title">
      <div className="amenu-head">
        <div>
          <h2 id="amenu-title">{t.title}</h2>
          {items && <p className="amenu-count">{t.countLabel(items.length, hidden)}</p>}
        </div>
        <button
          type="button"
          className="btn-solid"
          onClick={() => setAdding(true)}
          disabled={adding}
        >
          {t.addItem}
        </button>
      </div>

      {loading && <p aria-busy="true">{t.loading}</p>}

      {!loading && errorCode && (
        <div className="form-alert" role="alert">
          <p>{t.errors[errorCode] ?? t.errors.unknown}</p>
          <button type="button" className="btn-ghost" onClick={load}>
            {t.retry}
          </button>
        </div>
      )}

      {!loading && !errorCode && items && (
        <ul className="amenu-list">
          {adding && <AdminMenuItem key="new" item={BLANK_ITEM} defaultOpen onChanged={changed} />}
          {items.length === 0 && !adding && <p className="amenu-empty">{t.empty}</p>}
          {items.map((item) => (
            <AdminMenuItem key={item.id} item={item} onChanged={changed} />
          ))}
        </ul>
      )}
    </section>
  )
}
