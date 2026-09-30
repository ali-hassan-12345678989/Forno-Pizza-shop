import { useEffect, useMemo, useState } from 'react'
import { COPY } from '../content/copy'
import { MAX_INGREDIENT_COST, isValidCost } from '../config/adminInsights'
import { setIngredientCost } from '../api/adminInsights'
import { formatPrice, formatQuantity } from '../lib/format'
import './IngredientCosts.css'
import SearchField from './SearchField'

/**
 * What each ingredient costs, and what the shelves are therefore worth.
 *
 * THIS SCREEN IS THE FOUNDATION FOR FOUR OTHERS. Cost of goods sold, inventory
 * valuation, margin per pizza and the product mix all read one column, and this
 * is the only place it is written. Until somebody fills it in, all four say
 * "not priced" — which is the honest answer, and is why every one of them
 * reports its own coverage rather than quietly treating an unpriced ingredient
 * as a free one.
 *
 * PER UNIT, IN THE INGREDIENT'S OWN UNIT. Mozzarella is bought by the kilo and
 * stocked in grams, so the number wanted here is the price of ONE GRAM. That is
 * an easy thing to get wrong by a factor of a thousand, so the field says which
 * unit it wants, and the row shows what the answer implies for the stock on the
 * shelf — a mistyped cost turns "Rs. 24,600" into "Rs. 24,600,000" in the same
 * glance, which is far easier to notice than a wrong number in a box.
 */
export default function IngredientCosts({ rows, onSaved }) {
  const t = COPY.staff.costs

  const [query, setQuery] = useState('')
  const [drafts, setDrafts] = useState({})
  const [busyId, setBusyId] = useState(null)
  const [errorCode, setErrorCode] = useState(null)

  /* Reseeded whenever the rows change, so a value saved on another device — or
     by the same Admin on another tab — replaces what is in the box rather than
     being overwritten by a stale draft the next time anything is saved. */
  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        (rows ?? []).map((row) => [row.id, row.cost === null ? '' : String(row.cost)]),
      ),
    )
  }, [rows])

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return rows ?? []
    return (rows ?? []).filter((row) => row.name.toLowerCase().includes(needle))
  }, [rows, query])

  const priced = (rows ?? []).filter((row) => row.cost !== null).length
  const total = (rows ?? []).length
  const value = (rows ?? []).reduce((sum, row) => sum + (row.value ?? 0), 0)

  async function save(row) {
    const draft = drafts[row.id]
    const blank = String(draft ?? '').trim() === ''

    // Blank clears the price. "We do not know what this costs" has to stay
    // reachable, or a figure typed by mistake could only be replaced by another
    // guess and never withdrawn.
    if (!blank && !isValidCost(draft)) {
      setErrorCode('invalid_cost')
      return
    }

    setBusyId(row.id)
    setErrorCode(null)

    const { errorCode: code } = await setIngredientCost(row.id, blank ? null : Number(draft))

    setBusyId(null)
    if (code) setErrorCode(code)
    else onSaved?.()
  }

  if (!rows || rows.length === 0) return <p className="staff-note">{t.empty}</p>

  return (
    <section className="costs panel" aria-labelledby="costs-title">
      <div className="costs-head">
        <div>
          <h2 id="costs-title">{t.title}</h2>
          <p className="costs-summary">{t.summary(priced, total)}</p>
        </div>

        <div className="costs-value">
          <span className="costs-value-label">{t.valueLabel}</span>
          <strong className="costs-value-figure">{formatPrice(value)}</strong>
          {/* A valuation that silently omits the cheese is not a small error,
              so it says how much of the shelf it actually covers. */}
          {priced < total && <span className="costs-partial">{t.partial(priced, total)}</span>}
        </div>
      </div>

      <SearchField id="cost-search" label={t.searchLabel} value={query} onChange={setQuery} />

      {errorCode && (
        <div className="form-alert" role="alert">
          <p>{t.errors[errorCode] ?? t.errors.unknown}</p>
        </div>
      )}

      <div className="costs-scroll">
        <table className="costs-table">
          <thead>
            <tr>
              <th scope="col">{t.colIngredient}</th>
              <th scope="col" className="num">
                {t.colStock}
              </th>
              <th scope="col" className="num">
                {t.colCost}
              </th>
              <th scope="col" className="num">
                {t.colValue}
              </th>
              <th scope="col">
                <span className="sr-only">{t.colSave}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const draft = drafts[row.id] ?? ''
              const changed = draft !== (row.cost === null ? '' : String(row.cost))

              return (
                <tr key={row.id} className={row.cost === null ? 'is-unpriced' : undefined}>
                  <th scope="row">{row.name}</th>
                  <td className="num muted">{formatQuantity(row.stock, row.unit)}</td>

                  <td className="num">
                    <label className="sr-only" htmlFor={`cost-${row.id}`}>
                      {t.costAria(row.name, row.unit)}
                    </label>
                    <div className="costs-input-wrap">
                      <input
                        id={`cost-${row.id}`}
                        className="costs-input"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max={MAX_INGREDIENT_COST}
                        step="0.000001"
                        placeholder={t.perUnit(row.unit)}
                        value={draft}
                        disabled={busyId === row.id}
                        onChange={(event) =>
                          setDrafts((current) => ({ ...current, [row.id]: event.target.value }))
                        }
                      />
                      <span className="costs-unit">{t.perUnit(row.unit)}</span>
                    </div>
                  </td>

                  <td className="num">
                    {row.value === null ? (
                      <span className="costs-unknown">{t.notPriced}</span>
                    ) : (
                      formatPrice(row.value)
                    )}
                  </td>

                  <td>
                    <button
                      type="button"
                      className="costs-save"
                      disabled={!changed || busyId === row.id}
                      onClick={() => save(row)}
                    >
                      {busyId === row.id ? t.saving : t.save}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {shown.length === 0 && <p className="staff-note">{t.noMatch}</p>}
      <p className="staff-note">{t.footnote}</p>
    </section>
  )
}
