import { useMemo, useState } from 'react'
import IngredientPicker from './IngredientPicker'
import { COPY } from '../content/copy'
import { MAX_COUNT_NOTE, MAX_STOCK_COUNT, STOCK_DECIMALS, isValidCount } from '../config/inventory'
import { recordStockCount } from '../api/inventory'
import { formatQuantity, formatSignedQuantity } from '../lib/format'
import './StockCount.css'

/**
 * Counting what is actually on the shelf.
 *
 * WHY THIS EXISTS. The owner asked for theoretical usage to be compared against
 * actual usage, so that heavy-handed portioning would show up as a gap. There
 * was no gap to find: deduct_order_stock() computes each requirement from the
 * recipe and writes exactly that figure to the ledger, so the two numbers were
 * one calculation and their difference was always going to be zero — including
 * on the day a cook put double cheese on every pizza, which is the one thing it
 * was meant to catch.
 *
 * A physical count is the missing number. It is the only figure in this system
 * that the recipes did not produce, and therefore the only thing the books can
 * honestly be checked against. Count a shelf, and the difference between what
 * is there and what the books say is real: waste, breakage, over-portioning,
 * or somebody walking out with a box of cheese.
 *
 * ONE INGREDIENT AT A TIME, on purpose. A count is a measurement somebody took
 * standing at a shelf, and the note attached to it explains that one shelf. A
 * grid of thirty boxes would invite counting from memory, which produces a
 * number that looks like evidence and is not.
 */
export default function StockCount({ ingredients, onSaved }) {
  const t = COPY.staff.count

  const [chosenId, setChosenId] = useState(null)
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [errorCode, setErrorCode] = useState(null)

  const chosen = useMemo(
    () => ingredients.find((item) => item.id === chosenId) ?? null,
    [ingredients, chosenId],
  )

  // Nothing is ever excluded from this picker — an ingredient counted an hour
  // ago is exactly the one somebody might need to recount after finding a
  // second box in the back.
  const taken = useMemo(() => new Set(), [])

  function reset() {
    setChosenId(null)
    setCounted('')
    setNote('')
    setErrorCode(null)
  }

  function pick(id) {
    setChosenId(id)
    setCounted('')
    setNote('')
    setErrorCode(null)
    // The previous count's outcome belongs to the previous ingredient. Leaving
    // it on screen under a new name would attribute one shelf's discrepancy to
    // another.
    setResult(null)
  }

  async function submit(event) {
    event.preventDefault()
    if (busy || !chosen || !isValidCount(counted)) return

    setBusy(true)
    setErrorCode(null)

    const { result: saved, errorCode: code } = await recordStockCount(
      chosen.id,
      Number(counted),
      note.trim() || null,
    )

    setBusy(false)

    if (code) {
      setErrorCode(code)
      return
    }

    setResult({ ...saved, name: chosen.name, unit: chosen.unit })
    reset()
    onSaved?.()
  }

  const ready = Boolean(chosen) && isValidCount(counted)

  return (
    <section className="stock-count panel" aria-labelledby="count-title">
      <h2 id="count-title" className="staff-panel-title">
        {t.title}
      </h2>
      <p className="staff-note">{t.intro}</p>

      {result && <CountOutcome result={result} />}

      {!chosen && (
        <IngredientPicker ingredients={ingredients} taken={taken} onPick={pick} labels={t.picker} />
      )}

      {chosen && (
        <form className="count-form" onSubmit={submit}>
          <div className="count-chosen">
            <strong>{chosen.name}</strong>
            <span className="count-books">
              {t.booksSay(formatQuantity(chosen.stock, chosen.unit))}
            </span>
          </div>

          <label className="count-label" htmlFor="counted">
            {t.countedLabel(chosen.unit)}
          </label>
          <input
            id="counted"
            className="count-input"
            type="number"
            inputMode="decimal"
            min="0"
            max={MAX_STOCK_COUNT}
            step={1 / 10 ** STOCK_DECIMALS}
            value={counted}
            onChange={(event) => setCounted(event.target.value)}
            autoFocus
          />

          <label className="count-label" htmlFor="count-note">
            {t.noteLabel}
          </label>
          <input
            id="count-note"
            className="count-note"
            type="text"
            maxLength={MAX_COUNT_NOTE}
            placeholder={t.notePlaceholder}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />

          {errorCode && (
            <div className="form-alert" role="alert">
              <p>{t.errors[errorCode] ?? t.errors.unknown}</p>
            </div>
          )}

          <p className="count-warning">{t.willCorrect}</p>

          <div className="count-actions">
            <button type="submit" className="btn-solid" disabled={!ready || busy}>
              {busy ? t.saving : t.save}
            </button>
            <button type="button" className="btn-ghost" onClick={reset} disabled={busy}>
              {t.cancel}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

/**
 * What the count found.
 *
 * Three genuinely different outcomes, and they are not shades of one another.
 * Balanced is good news and is worth saying out loud — without it there is no
 * way to tell a shelf that counted clean from one nobody has counted. Short is
 * the finding this feature exists for. Over is usually a delivery booked in
 * wrong rather than good fortune, and says so rather than congratulating
 * anybody.
 */
function CountOutcome({ result }) {
  const t = COPY.staff.count
  const tone = result.variance === 0 ? 'clean' : result.variance < 0 ? 'short' : 'over'

  return (
    <div className={`count-outcome ${tone}`} role="status">
      <strong>{result.name}</strong>
      <p>
        {tone === 'clean'
          ? t.outcomeClean(formatQuantity(result.counted, result.unit))
          : t.outcomeOff(
              formatSignedQuantity(result.variance, result.unit),
              formatQuantity(result.expected, result.unit),
              formatQuantity(result.counted, result.unit),
            )}
      </p>
      {tone !== 'clean' && <p className="count-outcome-note">{t.outcomeCorrected}</p>}
    </div>
  )
}
