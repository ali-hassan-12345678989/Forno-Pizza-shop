import { useEffect, useMemo, useRef, useState } from 'react'
import IngredientPicker from './IngredientPicker'
import { COPY } from '../content/copy'
import { MAX_STOCK_RECEIPT, STOCK_DECIMALS } from '../config/inventory'
import { projectLevel, readyLines } from '../lib/deliverySheet'
import { receiveStock } from '../api/inventory'
import { formatQuantity } from '../lib/format'
import './ReceiveStock.css'

/**
 * FR-6.2: the Manager books in a delivery.
 *
 * A delivery note has several lines on it, so this takes several lines and
 * saves them under one button. The database has no notion of a delivery — each
 * line is its own receive_stock() call, sent one at a time so a failure can be
 * named rather than hidden behind "something went wrong".
 *
 * Adds, never sets. The browser sends only "how much arrived" and never
 * computes a new total, because the minutes the Manager spent filling the sheet
 * in may well have contained orders that deducted from the same ingredients.
 * The one figure worked out here is the projection beside each line, which
 * describes a change that has not happened yet — see lib/deliverySheet.js.
 */
export default function ReceiveStock({
  ingredients,
  lines,
  onAdd,
  onRemove,
  onQuantity,
  onSaved,
  // Whether a stock table sits beside this sheet to add lines from. The
  // dashboard has none, so it does not tell the Manager to use one.
  fromTable = false,
}) {
  const t = COPY.staff.receive

  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(0)
  const [result, setResult] = useState(null)

  const byId = useMemo(() => new Map(ingredients.map((item) => [item.id, item])), [ingredients])
  const taken = useMemo(() => new Set(lines.map((line) => line.ingredientId)), [lines])
  const ready = readyLines(lines)

  // Focusing a line the moment it appears is what ties the two halves of this
  // screen together: pressing "Add stock" in the table puts the caret in the
  // box that wants a number, and the browser scrolls it into view for free.
  const inputsRef = useRef(new Map())
  const seenRef = useRef([])

  useEffect(() => {
    const ids = lines.map((line) => line.ingredientId)
    const added = ids.find((id) => !seenRef.current.includes(id))
    seenRef.current = ids
    if (added) inputsRef.current.get(added)?.focus()
  }, [lines])

  async function submit(event) {
    event.preventDefault()
    if (busy || ready.length === 0) return

    setBusy(true)
    setSent(0)
    setResult(null)

    const failures = []
    let done = 0

    for (const line of ready) {
      const { errorCode } = await receiveStock(line.ingredientId, Number(line.quantity))

      if (errorCode) {
        failures.push({ ingredientId: line.ingredientId, errorCode })
      } else {
        done += 1
        // Taken off as it lands, so pressing the button again retries only what
        // did not go in — never what already did.
        onRemove(line.ingredientId)
      }

      setSent(done + failures.length)
    }

    setBusy(false)
    setResult({ done, failures })
    onSaved()
  }

  return (
    <section className="sheet panel" aria-labelledby="sheet-title">
      <div className="sheet-head">
        <h2 id="sheet-title">{t.title}</h2>
        <p className="panel-sub">{t.subtitle}</p>
      </div>

      <form onSubmit={submit} noValidate>
        {lines.length === 0 ? (
          <div className="sheet-empty">
            <b>{t.empty}</b>
            <span>{fromTable ? t.emptyHintTable : t.emptyHintAlone}</span>
          </div>
        ) : (
          <ul className="sheet-lines">
            {lines.map((line) => {
              const item = byId.get(line.ingredientId)
              if (!item) return null

              return (
                <SheetLine
                  key={line.ingredientId}
                  item={item}
                  quantity={line.quantity}
                  disabled={busy}
                  inputRef={(node) => {
                    if (node) inputsRef.current.set(item.id, node)
                    else inputsRef.current.delete(item.id)
                  }}
                  onQuantity={(value) => {
                    setResult(null)
                    onQuantity(item.id, value)
                  }}
                  onRemove={() => {
                    setResult(null)
                    onRemove(item.id)
                  }}
                />
              )
            })}
          </ul>
        )}

        {lines.length > 0 && (
          <div className="sheet-foot">
            <span className="sheet-count">
              {ready.length === lines.length
                ? t.ready(lines.length)
                : t.partial(ready.length, lines.length)}
            </span>
            <button type="submit" className="btn-solid" disabled={busy || ready.length === 0}>
              {busy ? t.busy(sent, ready.length) : t.submit}
            </button>
          </div>
        )}

        {result && <SheetResult result={result} byId={byId} />}
      </form>

      <IngredientPicker
        ingredients={ingredients}
        taken={taken}
        onPick={(id) => {
          setResult(null)
          onAdd(id)
        }}
      />
    </section>
  )
}

/** One line of the delivery note: what arrived, and what it will leave behind. */
function SheetLine({ item, quantity, disabled, inputRef, onQuantity, onRemove }) {
  const t = COPY.staff.receive
  const projection = projectLevel(item, quantity)

  return (
    <li className="sheet-line">
      <div className="sheet-line-head">
        <span className="sheet-line-name">{item.name}</span>
        <button
          type="button"
          className="sheet-drop"
          onClick={onRemove}
          disabled={disabled}
          aria-label={t.removeAria(item.name)}
        >
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* The unit sits inside the control rather than in a sentence beside it,
          so "how much" and "of what" read as one answer. */}
      <div className="qty">
        <input
          ref={inputRef}
          type="number"
          inputMode="decimal"
          min="0"
          max={MAX_STOCK_RECEIPT}
          step={10 ** -STOCK_DECIMALS}
          value={quantity}
          disabled={disabled}
          aria-label={t.quantityAria(item.name, item.unit)}
          onChange={(event) => onQuantity(event.target.value)}
        />
        <span className="qty-unit" aria-hidden="true">
          {item.unit}
        </span>
      </div>

      <p className="sheet-maths">
        {projection ? (
          <>
            <span className="sheet-from">
              {t.afterwards(
                formatQuantity(item.stock, item.unit),
                formatQuantity(projection.after, item.unit),
              )}
            </span>
            <span
              className={`stock-pill ${projection.willBeOut ? 'out' : projection.willBeLow ? 'low' : 'ok'}`}
            >
              {projection.willBeOut
                ? t.willBeOut
                : projection.willBeLow
                  ? t.willBeLow
                  : item.isLow || item.isOut
                    ? t.backAbove
                    : t.stillFine}
            </span>
          </>
        ) : (
          <span className="sheet-from">{t.nowAt(formatQuantity(item.stock, item.unit))}</span>
        )}
      </p>
    </li>
  )
}

/**
 * What happened. Lines go in one at a time, so "some of it worked" is a real
 * outcome and gets said out loud rather than rounded to success or failure.
 */
function SheetResult({ result, byId }) {
  const t = COPY.staff.receive
  const { done, failures } = result

  if (failures.length === 0) {
    return (
      <p className="sheet-ok" role="status">
        {t.success(done)}
      </p>
    )
  }

  return (
    <div className="form-alert" role="alert">
      <p>{done > 0 ? t.someWentIn(done) : t.noneWentIn}</p>
      <ul className="sheet-failed">
        {failures.map((failure) => (
          <li key={failure.ingredientId}>
            {t.failedLine(
              byId.get(failure.ingredientId)?.name ?? failure.ingredientId,
              t.errors[failure.errorCode] ?? t.errors.unknown,
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
