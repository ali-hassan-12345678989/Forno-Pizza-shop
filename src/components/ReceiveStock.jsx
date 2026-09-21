import { useMemo, useState } from 'react'
import { COPY } from '../content/copy'
import { MAX_STOCK_RECEIPT, STOCK_DECIMALS, isValidReceipt } from '../config/inventory'
import { receiveStock } from '../api/inventory'
import { formatQuantity } from '../lib/format'
import './ReceiveStock.css'

/**
 * FR-6.2: the Manager books in a delivery.
 *
 * Adds, never sets. The browser sends only "how much arrived" — it never
 * computes a new total, because the seconds the Manager spent typing may well
 * have contained an order that deducted from the same ingredient.
 *
 * The validation here is a courtesy that saves a round trip. receive_stock()
 * repeats every one of these checks, and is the only one that counts.
 */
export default function ReceiveStock({ ingredients, onReceived }) {
  const t = COPY.staff.receive

  const [ingredientId, setIngredientId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [busy, setBusy] = useState(false)

  const chosen = useMemo(
    () => ingredients.find((i) => i.id === ingredientId) ?? null,
    [ingredients, ingredientId],
  )

  async function submit(event) {
    event.preventDefault()
    if (busy) return

    const next = {}
    if (!ingredientId) next.ingredient = 'ingredientRequired'
    if (!String(quantity).trim()) next.quantity = 'quantityRequired'
    else if (!isValidReceipt(quantity)) next.quantity = 'invalid_quantity'

    setErrors(next)
    setServerError(null)
    setSuccess(null)
    if (Object.keys(next).length > 0) return

    setBusy(true)
    const { row, errorCode } = await receiveStock(ingredientId, Number(quantity))
    setBusy(false)

    if (errorCode) {
      setServerError(t.errors[errorCode] ?? t.errors.unknown)
      return
    }

    setSuccess(
      t.success(
        formatQuantity(Number(quantity), row.unit),
        row.name,
        formatQuantity(row.stock, row.unit),
      ),
    )
    setQuantity('')
    onReceived?.(row)
  }

  return (
    <section className="receive panel" aria-labelledby="receive-title">
      <h2 id="receive-title">{t.title}</h2>
      <p className="panel-sub">{t.subtitle}</p>

      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="receive-ingredient">{t.ingredient}</label>
          <div className="field-input">
            <select
              id="receive-ingredient"
              value={ingredientId}
              onChange={(e) => {
                setIngredientId(e.target.value)
                setErrors((prev) => ({ ...prev, ingredient: undefined }))
                setSuccess(null)
              }}
              className={errors.ingredient ? 'err' : ''}
              aria-invalid={Boolean(errors.ingredient)}
            >
              <option value="">{t.ingredientPlaceholder}</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} — {formatQuantity(i.stock, i.unit)}
                </option>
              ))}
            </select>
          </div>
          {errors.ingredient && <span className="errmsg">{t.errors[errors.ingredient]}</span>}
        </div>

        <div className="field">
          <label htmlFor="receive-quantity">{t.quantity}</label>
          <div className="field-input">
            <input
              id="receive-quantity"
              type="number"
              inputMode="decimal"
              min="0"
              max={MAX_STOCK_RECEIPT}
              step={10 ** -STOCK_DECIMALS}
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value)
                setErrors((prev) => ({ ...prev, quantity: undefined }))
                setSuccess(null)
              }}
              className={errors.quantity ? 'err' : ''}
              aria-invalid={Boolean(errors.quantity)}
            />
            <span className="receive-unit">
              {chosen ? t.quantityHint(chosen.unit) : t.quantityHintNone}
            </span>
          </div>
          {errors.quantity && <span className="errmsg">{t.errors[errors.quantity]}</span>}
        </div>

        {serverError && (
          <p className="form-alert" role="alert">
            {serverError}
          </p>
        )}

        {success && (
          <p className="receive-ok" role="status">
            {success}
          </p>
        )}

        <button type="submit" className="btn-solid" disabled={busy}>
          {busy ? t.busy : t.submit}
        </button>
      </form>
    </section>
  )
}
