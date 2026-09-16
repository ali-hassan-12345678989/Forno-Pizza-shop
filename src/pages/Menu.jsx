import { useEffect, useMemo, useState } from 'react'
import { fetchMenu, categoriesOf } from '../api/menu'
import MenuCard from '../components/MenuCard'
import ItemModal from '../components/ItemModal'
import BackLink from '../components/BackLink'
import { COPY } from '../content/copy'
import { ROUTES } from '../config/routes'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import './Menu.css'

export default function Menu() {
  const [items, setItems] = useState(null)
  const [failed, setFailed] = useState(false)
  const [activeCategory, setActiveCategory] = useState(null)
  const [openItem, setOpenItem] = useState(null)
  const t = COPY.menu

  useDocumentTitle(t.title)

  useEffect(() => {
    let cancelled = false

    fetchMenu()
      .then((data) => !cancelled && setItems(data))
      // The reason is for the console, not the customer: a raw PostgREST
      // message ("permission denied for table menu_items") tells them nothing
      // they can act on and leaks the schema.
      .catch((err) => {
        if (cancelled) return
        console.error('Menu failed to load:', err)
        setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const categories = useMemo(() => (items ? categoriesOf(items) : []), [items])

  const visible = useMemo(() => {
    if (!items) return []
    if (!activeCategory) return items
    return items.filter((item) => item.category === activeCategory)
  }, [items, activeCategory])

  return (
    <>
      <div className="menu-banner">
        <div className="wrap menu-banner-in">
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
          {items && <span className="menu-count">{t.itemCount(items.length)}</span>}
        </div>
      </div>

      <section className="wrap menu-page" aria-label={t.ariaLabel}>
        <div className="menu-back">
          <BackLink to={ROUTES.home} label={COPY.nav.backToHome} />
        </div>

        {/* Chips only appear once items actually carry categories, so the page
            works before and after the category column is added. */}
        {categories.length > 0 && (
          <nav className="cats" aria-label={t.categoryNavLabel}>
            <button
              type="button"
              className={activeCategory === null ? 'on' : ''}
              onClick={() => setActiveCategory(null)}
            >
              {t.allCategories}
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={activeCategory === cat ? 'on' : ''}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </nav>
        )}

        {failed && (
          <p className="menu-msg menu-err" role="alert">
            {t.loadError}
          </p>
        )}

        {!failed && items === null && <MenuSkeleton />}

        {!failed && items !== null && visible.length === 0 && (
          <div className="menu-msg">
            <strong>{t.empty}</strong>
            <p>{t.emptyHint}</p>
          </div>
        )}

        {visible.length > 0 && (
          <div className="menu-grid">
            {visible.map((item) => (
              <MenuCard key={item.id} item={item} onOpen={setOpenItem} />
            ))}
          </div>
        )}
      </section>

      <ItemModal item={openItem} open={openItem !== null} onClose={() => setOpenItem(null)} />
    </>
  )
}

function MenuSkeleton() {
  return (
    <div className="menu-grid" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="skel-card">
          <div className="skel-pic" />
          <div className="skel-body">
            <div className="skel-line w60" />
            <div className="skel-line w90" />
            <div className="skel-line w40" />
          </div>
        </div>
      ))}
    </div>
  )
}
