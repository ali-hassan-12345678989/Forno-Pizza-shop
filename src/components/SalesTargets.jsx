import { useEffect, useState } from 'react'
import { COPY } from '../content/copy'
import { MAX_SALES_TARGET, WEEKDAY_ORDER, isValidTarget } from '../config/adminInsights'
import { setSalesTarget } from '../api/adminInsights'
import { formatPrice } from '../lib/format'
import './SalesTargets.css'

/**
 * What each day of the week is expected to take.
 *
 * PER WEEKDAY, NOT PER DATE. Trade runs on a weekly cycle — the same reason the
 * Manager's dashboard compares today against the same weekday — so seven
 * numbers set once will keep working. A target per calendar date is a
 * spreadsheet somebody has to keep filling in forever, and the first week
 * nobody fills it in, every figure built on it silently becomes wrong.
 *
 * Monday first, because that is how a week is read. The database keys on
 * Postgres's own `extract(dow)`, where Sunday is 0, so the rotation happens
 * here — which is what lets a target be joined to a sales row without anything
 * having to translate between two conventions.
 */
export default function SalesTargets({ rows, onSaved }) {
  const t = COPY.staff.targets

  const [drafts, setDrafts] = useState({})
  const [busy, setBusy] = useState(null)
  const [errorCode, setErrorCode] = useState(null)

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        (rows ?? []).map((row) => [row.dayOfWeek, row.target === null ? '' : String(row.target)]),
      ),
    )
  }, [rows])

  const byDay = new Map((rows ?? []).map((row) => [row.dayOfWeek, row]))

  async function save(dow) {
    const draft = drafts[dow]
    const blank = String(draft ?? '').trim() === ''

    // Blank clears the target, for the same reason a blank cost withdraws a
    // price: a figure typed by mistake has to be removable, not merely
    // replaceable by another guess.
    if (!blank && !isValidTarget(draft)) {
      setErrorCode('invalid_target')
      return
    }

    setBusy(dow)
    setErrorCode(null)
    const { errorCode: code } = await setSalesTarget(dow, blank ? null : Number(draft))
    setBusy(null)

    if (code) setErrorCode(code)
    else onSaved?.()
  }

  return (
    <section className="targets panel" aria-labelledby="targets-title">
      <h2 id="targets-title" className="staff-panel-title">
        {t.title}
      </h2>
      <p className="staff-note">{t.intro}</p>

      {errorCode && (
        <div className="form-alert" role="alert">
          <p>{t.errors[errorCode] ?? t.errors.unknown}</p>
        </div>
      )}

      <ul className="targets-list">
        {WEEKDAY_ORDER.map((dow) => {
          const row = byDay.get(dow)
          const draft = drafts[dow] ?? ''
          const changed =
            draft !== (row?.target === null || row?.target === undefined ? '' : String(row.target))

          return (
            <li key={dow} className="targets-row">
              <label className="targets-day" htmlFor={`target-${dow}`}>
                {t.days[dow]}
              </label>

              <input
                id={`target-${dow}`}
                type="number"
                inputMode="decimal"
                min="0"
                max={MAX_SALES_TARGET}
                step="1"
                placeholder={t.notSet}
                value={draft}
                disabled={busy === dow}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [dow]: event.target.value }))
                }
              />

              <button
                type="button"
                className="targets-save"
                disabled={!changed || busy === dow}
                onClick={() => save(dow)}
              >
                {busy === dow ? t.saving : t.save}
              </button>
            </li>
          )
        })}
      </ul>

      <p className="staff-note">
        {t.footnote(formatPrice((rows ?? []).reduce((sum, r) => sum + (r.target ?? 0), 0)))}
      </p>
    </section>
  )
}
