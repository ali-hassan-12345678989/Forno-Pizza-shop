import { COPY } from '../content/copy'
import { downloadCsv, toCsv } from '../lib/csv'

/**
 * Takes the table beside it to a spreadsheet.
 *
 * `columns` is a list of { key, header, format? } so the file's column order
 * and headings are decided by the caller rather than by whatever order an
 * object's keys happen to be in — not something to leave to chance in a file
 * somebody will reconcile accounts from.
 *
 * Deliberately not offered when there is nothing to export. A button that
 * produces an empty file has wasted a click and taught the reader not to try
 * again.
 */
export default function ExportButton({ rows, columns, filename, label }) {
  const t = COPY.staff.exportCsv

  if (!rows || rows.length === 0) return null

  return (
    <button
      type="button"
      className="btn-ghost"
      onClick={() => downloadCsv(filename, toCsv(rows, columns))}
    >
      {label ?? t.label}
    </button>
  )
}
