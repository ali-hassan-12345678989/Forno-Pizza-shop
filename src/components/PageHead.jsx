/**
 * The heading every staff section opens with, plus room for one action.
 *
 * Shared so each section starts at the same place on the page — the eye should
 * not have to re-find the title when the sidebar changes what is beside it.
 */
export default function PageHead({ title, subtitle, children }) {
  return (
    <header className="staff-page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="staff-page-actions">{children}</div>}
    </header>
  )
}
