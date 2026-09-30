import { Link } from 'react-router-dom'
import AdminMenuList from '../components/AdminMenuList'
import MenuMargins from '../components/MenuMargins'
import PageHead from '../components/PageHead'
import StaffError from '../components/StaffError'
import { COPY } from '../content/copy'
import { STAFF_ROLES } from '../config/staff'
import { SECTION_IDS, newRecordPath } from '../config/staffNav'
import { fetchAdminMenu } from '../api/adminMenu'
import { fetchMenuCosts } from '../api/adminInsights'
import { useAsyncData } from '../lib/useAsyncData'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/**
 * FR-7.2, the index: the whole menu, one row each.
 *
 * "Add an item" is a link rather than a button because it goes to the same
 * editor every other item goes to — with nothing in it yet. That way a new item
 * and an existing one are one screen, not two that have to be kept in step.
 */
export default function AdminMenuSection() {
  const t = COPY.staff
  useDocumentTitle(`${t.pages.menuTitle} · ${t.adminTitle}`)

  /* Deliberately not in the blocking pair with the menu below. Margins are
     what to think about; the menu is what to edit, and a slow costing read
     should not replace a working editor with a retry button. */
  const margins = useAsyncData(async () => {
    const { rows, errorCode: code } = await fetchMenuCosts()
    return { data: rows, errorCode: code }
  })

  const {
    data: items,
    errorCode,
    loading,
    reload,
  } = useAsyncData(async () => {
    const { items: data, errorCode: code } = await fetchAdminMenu()
    return { data, errorCode: code }
  })

  const hidden = items?.filter((item) => !item.isActive).length ?? 0

  return (
    <>
      <PageHead
        title={t.pages.menuTitle}
        subtitle={items ? t.menu.countLabel(items.length, hidden) : undefined}
      >
        <Link className="btn-solid" to={newRecordPath(STAFF_ROLES.admin, SECTION_IDS.menu)}>
          {t.menu.addItem}
        </Link>
      </PageHead>

      {loading && <p aria-busy="true">{t.menu.loading}</p>}
      {!loading && errorCode && (
        <StaffError code={errorCode} messages={t.menu.errors} onRetry={reload} />
      )}

      <MenuMargins
        rows={margins.data}
        loading={margins.loading}
        errorCode={margins.errorCode}
        onRetry={() => margins.reload()}
      />

      {!loading && !errorCode && items && <AdminMenuList items={items} />}
    </>
  )
}
