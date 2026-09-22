import { Link, useParams } from 'react-router-dom'
import MenuItemEditor from '../components/MenuItemEditor'
import StaffError from '../components/StaffError'
import { COPY } from '../content/copy'
import { STAFF_ROLES } from '../config/staff'
import { DETAIL_PARAM, NEW_RECORD_ID, SECTION_IDS, pathTo } from '../config/staffNav'
import { blankMenuItem, fetchAdminMenu } from '../api/adminMenu'
import { useAsyncData } from '../lib/useAsyncData'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/**
 * FR-7.2, one item on its own URL.
 *
 * The whole menu is fetched rather than the single item, because there is no
 * one-item function and because the editor needs its neighbours anyway — for
 * the position control and for the list of sections already in use. It is one
 * small menu; a second function to save one round trip would be a second thing
 * to keep in step with admin_menu_items().
 */
export default function AdminMenuItemPage() {
  const t = COPY.staff
  const params = useParams()

  const recordId = params[DETAIL_PARAM]
  const isNew = recordId === NEW_RECORD_ID

  const {
    data: items,
    errorCode,
    loading,
    reload,
  } = useAsyncData(async () => {
    const { items: data, errorCode: code } = await fetchAdminMenu()
    return { data, errorCode: code }
  })

  const found = items?.find((item) => item.id === recordId) ?? null
  const item = isNew ? blankMenuItem() : found

  useDocumentTitle(`${item?.name || t.menu.newItem} · ${t.adminTitle}`)

  if (loading) return <p aria-busy="true">{t.menu.loading}</p>

  if (errorCode) {
    return <StaffError code={errorCode} messages={t.menu.errors} onRetry={reload} />
  }

  // A stale bookmark, or an item deleted in another tab.
  if (!item) {
    return (
      <div className="medit-missing">
        <p>{t.menu.notFound}</p>
        <Link className="btn-ghost" to={pathTo(STAFF_ROLES.admin, SECTION_IDS.menu)}>
          {t.menu.backToMenu}
        </Link>
      </div>
    )
  }

  return (
    <MenuItemEditor
      // Remounts when the Admin opens a different item, so the draft starts
      // from that item rather than carrying the last one's edits across.
      key={recordId}
      item={item}
      items={items ?? []}
      onSaved={() => reload({ silent: true })}
    />
  )
}
