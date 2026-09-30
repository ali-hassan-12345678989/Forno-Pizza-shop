/**
 * Turning a table on screen into a file somebody can open in a spreadsheet.
 *
 * Pure, so the escaping rules are testable without a browser.
 *
 * WHY NOT JUST JOIN WITH COMMAS. A customer called "Khan, Ali" or an address
 * containing a line break would silently split into extra columns and shift
 * every figure on that row one place left — which is worse than no export,
 * because the file still opens and still looks like a spreadsheet.
 */

/** RFC 4180: quote anything containing a comma, a quote or a newline; double the quotes. */
export function escapeCell(value) {
  if (value === null || value === undefined) return ''

  const text = String(value)
  if (!/[",\n\r]/.test(text)) return text

  return `"${text.replace(/"/g, '""')}"`
}

/**
 * Rows of objects into one CSV string.
 *
 * `columns` is a list of { key, header } so the file's column order and its
 * headings are decided by the caller rather than by whatever order the object's
 * keys happen to be in — which is not something to leave to chance in a file
 * somebody will reconcile accounts from.
 *
 * CRLF line endings, because Excel on Windows is where these land and it is the
 * one consumer that still cares.
 */
export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCell(c.header)).join(',')

  const body = (rows ?? []).map((row) =>
    columns.map((c) => escapeCell(c.format ? c.format(row[c.key], row) : row[c.key])).join(','),
  )

  return [header, ...body].join('\r\n')
}

/**
 * Hands the file to the browser.
 *
 * A Blob and an object URL rather than a data: URI — a data: URI of a year's
 * orders can exceed what some browsers accept in an href, and fails by doing
 * nothing at all when it does.
 *
 * The URL is revoked on the next tick rather than immediately: revoking it in
 * the same frame as the click races the download in some browsers and produces
 * an empty file.
 */
export function downloadCsv(filename, csv) {
  if (typeof document === 'undefined') return false

  // A BOM, so Excel reads it as UTF-8. Without it "Rs." and any Urdu in a
  // customer's name arrive as mojibake, which looks like corrupted data.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()

  setTimeout(() => URL.revokeObjectURL(url), 0)
  return true
}
