import PageHead from '../components/PageHead'
import StaffError from '../components/StaffError'
import UsageTable from '../components/UsageTable'
import { COPY } from '../content/copy'
import { fetchIngredientUsage } from '../api/usage'
import { useAsyncData } from '../lib/useAsyncData'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { STAFF_ROLES } from '../config/staff'
import { useStaff } from '../context/StaffContext'

/**
 * What the kitchen has got through — the same screen for both roles.
 *
 * One component rather than a Manager copy and an Admin copy, because it is
 * genuinely one screen: staff_ingredient_usage() admits both roles and returns
 * them the same rows. Two files would be two places for the same table to drift
 * apart, and the panel title is the only thing that actually differs.
 */
export default function StaffUsage() {
  const t = COPY.staff
  const { role } = useStaff()

  useDocumentTitle(
    `${t.pages.usageTitle} · ${role === STAFF_ROLES.admin ? t.adminTitle : t.managerTitle}`,
  )

  const {
    data: rows,
    errorCode,
    loading,
    reload,
  } = useAsyncData(async () => {
    const { rows: data, errorCode: code } = await fetchIngredientUsage()
    return { data, errorCode: code }
  })

  return (
    <>
      <PageHead title={t.pages.usageTitle} subtitle={t.pages.usageSub} />

      {loading && <p aria-busy="true">{t.usage.loading}</p>}
      {!loading && errorCode && (
        <StaffError code={errorCode} messages={t.usage.errors} onRetry={reload} />
      )}

      {!loading && !errorCode && rows && <UsageTable rows={rows} />}
    </>
  )
}
