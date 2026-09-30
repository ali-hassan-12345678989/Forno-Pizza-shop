import { useCallback, useEffect, useMemo, useState } from 'react'
import IngredientPicker from './IngredientPicker'
import { COPY } from '../content/copy'
import { MAX_RECIPE_QUANTITY, isValidRecipeQuantity } from '../config/adminInsights'
import { deleteRecipeLine, fetchRecipeForSize, saveRecipeLine } from '../api/adminInsights'
import { formatPrice, formatPriceOrUnknown, formatQuantity } from '../lib/format'
import './RecipeEditor.css'

/**
 * What actually goes on one size of one pizza.
 *
 * WHY THIS IS NOT COSMETIC. These rows are the bill of materials the stock
 * engine has been running on since Part 3: deduct_order_stock() reads them on
 * every single order and takes exactly these quantities off the shelf. Until
 * now the only way to change how much cheese goes on a Large was for somebody
 * to write SQL, which means in practice it has never changed.
 *
 * Editing them therefore changes real stock arithmetic from the next order
 * onwards. It does NOT rewrite history: the ledger records what was deducted at
 * the time, which is the whole reason usage figures do not shift under your feet
 * when a recipe is corrected — see the note at the top of stock_movements.sql.
 *
 * THE ONE THING THE DATABASE WILL REFUSE is emptying the recipe of a size that
 * is live on the menu. A size with no recipe makes place_order() raise
 * `recipe_missing`, so the pizza would stay listed, stay addable to a cart, and
 * fail at the last step of checkout. The screen explains that refusal rather
 * than reporting it as an error, because it is the database protecting a
 * customer rather than something going wrong.
 */
export default function RecipeEditor({ sizeId, sizeLabel, price, ingredients, onChanged }) {
  const t = COPY.staff.recipe

  const [rows, setRows] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [busy, setBusy] = useState(null)
  const [errorCode, setErrorCode] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!sizeId) return
    setLoading(true)
    const { rows: data, errorCode: code } = await fetchRecipeForSize(sizeId)
    setRows(data)
    setErrorCode(code)
    setDrafts(Object.fromEntries((data ?? []).map((r) => [r.ingredientId, String(r.quantity)])))
    setLoading(false)
  }, [sizeId])

  useEffect(() => {
    load()
  }, [load])

  const taken = useMemo(() => new Set((rows ?? []).map((r) => r.ingredientId)), [rows])

  /* Null when ANY line is unpriced. The cost of the four ingredients that
     happen to have a price is not the cost of the pizza, and showing it as one
     is how a menu decision gets made on a flattering number. */
  const foodCost = useMemo(() => {
    if (!rows || rows.length === 0) return null
    if (rows.some((r) => r.lineCost === null)) return null
    return rows.reduce((sum, r) => sum + r.lineCost, 0)
  }, [rows])

  async function run(action) {
    setErrorCode(null)
    const { errorCode: code } = await action()
    if (code) {
      setErrorCode(code)
      return false
    }
    await load()
    onChanged?.()
    return true
  }

  async function saveLine(ingredientId) {
    const draft = drafts[ingredientId]
    if (!isValidRecipeQuantity(draft)) {
      setErrorCode('invalid_quantity')
      return
    }
    setBusy(ingredientId)
    await run(() => saveRecipeLine(sizeId, ingredientId, Number(draft)))
    setBusy(null)
  }

  async function removeLine(ingredientId) {
    setBusy(ingredientId)
    await run(() => deleteRecipeLine(sizeId, ingredientId))
    setBusy(null)
  }

  async function addLine(ingredientId) {
    /* Added at a placeholder quantity rather than zero, because zero is not a
       recipe line and the database refuses it. One gram of something is a
       number somebody will obviously correct; a row that silently failed to
       save is not. */
    setBusy(ingredientId)
    await run(() => saveRecipeLine(sizeId, ingredientId, 1))
    setBusy(null)
  }

  if (loading) return <p aria-busy="true">{t.loading}</p>

  return (
    <section className="recipe" aria-labelledby={`recipe-${sizeId}`}>
      <div className="recipe-head">
        <h3 id={`recipe-${sizeId}`}>{t.title(sizeLabel)}</h3>
        <span className="recipe-cost">
          {t.costs(formatPriceOrUnknown(foodCost, t.costUnknown), formatPrice(price))}
        </span>
      </div>

      <p className="staff-note">{t.intro}</p>

      {errorCode && (
        <div className="form-alert" role="alert">
          <p>{t.errors[errorCode] ?? t.errors.unknown}</p>
        </div>
      )}

      {rows && rows.length === 0 && <p className="recipe-empty">{t.none}</p>}

      {rows && rows.length > 0 && (
        <ul className="recipe-lines">
          {rows.map((row) => (
            <li key={row.ingredientId} className="recipe-line">
              <span className="recipe-name">{row.name}</span>

              <span className="recipe-qty">
                <label className="sr-only" htmlFor={`qty-${row.ingredientId}`}>
                  {t.quantityAria(row.name, row.unit)}
                </label>
                <input
                  id={`qty-${row.ingredientId}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max={MAX_RECIPE_QUANTITY}
                  step="0.001"
                  value={drafts[row.ingredientId] ?? ''}
                  disabled={busy === row.ingredientId}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [row.ingredientId]: event.target.value,
                    }))
                  }
                />
                <span className="recipe-unit">{row.unit}</span>
              </span>

              <span className="recipe-line-cost">
                {formatPriceOrUnknown(row.lineCost, t.costUnknown)}
              </span>

              <span className="recipe-actions">
                <button
                  type="button"
                  className="recipe-save"
                  disabled={
                    busy === row.ingredientId || drafts[row.ingredientId] === String(row.quantity)
                  }
                  onClick={() => saveLine(row.ingredientId)}
                >
                  {t.save}
                </button>
                <button
                  type="button"
                  className="recipe-remove"
                  disabled={busy === row.ingredientId}
                  onClick={() => removeLine(row.ingredientId)}
                  aria-label={t.removeAria(row.name)}
                >
                  {t.remove}
                </button>
              </span>

              {/* Beside the line it belongs to. An ingredient the kitchen is
                  nearly out of is a different decision from one that is plentiful,
                  and this is where somebody is thinking about that ingredient. */}
              <span className="recipe-stock">{t.inStock(formatQuantity(row.stock, row.unit))}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="recipe-add">
        <IngredientPicker
          ingredients={ingredients ?? []}
          taken={taken}
          onPick={addLine}
          labels={t.picker}
        />
      </div>
    </section>
  )
}
