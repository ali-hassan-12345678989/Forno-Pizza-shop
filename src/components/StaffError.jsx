import { COPY } from '../content/copy'

/**
 * How a staff section reports that it could not load.
 *
 * Shared so every section fails the same way, and so the retry is always a
 * button rather than an instruction to refresh the page. `messages` is the
 * section's own error map, which is why the code is looked up there first.
 */
export default function StaffError({ code, messages, onRetry }) {
  const t = COPY.staff.dashboard

  return (
    <div className="form-alert" role="alert">
      <p>{messages?.[code] ?? messages?.unknown ?? t.error}</p>
      {onRetry && (
        <button type="button" className="btn-ghost" onClick={() => onRetry()}>
          {t.retry}
        </button>
      )}
    </div>
  )
}
