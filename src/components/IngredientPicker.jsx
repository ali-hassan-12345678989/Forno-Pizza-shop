import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { COPY } from '../content/copy'
import { formatQuantity } from '../lib/format'

/**
 * Type-to-find, in place of a dropdown holding every ingredient.
 *
 * Past roughly fifteen options a plain <select> stops being a shortcut and
 * becomes a list to scroll, which is the state the single-line form was in.
 * The pattern here is the standard combobox: a text field that filters, with
 * the current stock beside each match so the Manager can tell at a glance
 * whether they meant that one.
 *
 * Options already on the sheet are left out rather than shown and refused —
 * there is nothing useful to do with a match that cannot be picked.
 */
export default function IngredientPicker({ ingredients, taken, onPick }) {
  const t = COPY.staff.receive

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)

  const inputId = useId()
  const listId = useId()
  const rootRef = useRef(null)

  const available = useMemo(
    () => ingredients.filter((item) => !taken.has(item.id)),
    [ingredients, taken],
  )

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    return available.filter((item) => item.name.toLowerCase().includes(needle))
  }, [available, query])

  // Clamp rather than reset: retyping should not throw away the highlight if
  // the item under it is still in the list.
  useEffect(() => {
    setActive((current) => (current >= matches.length ? 0 : current))
  }, [matches.length])

  // A click anywhere else is a dismissal. Escape does the same from the keyboard.
  useEffect(() => {
    if (!open) return undefined

    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function choose(item) {
    onPick(item.id)
    setQuery('')
    setOpen(false)
    setActive(0)
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      setQuery('')
      setOpen(false)
      return
    }

    if (!open || matches.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((current) => (current + 1) % matches.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => (current - 1 + matches.length) % matches.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(matches[active])
    }
  }

  const listOpen = open && query.trim().length > 0
  const activeId = listOpen && matches.length > 0 ? `${listId}-${active}` : undefined
  const nothingLeft = available.length === 0

  return (
    <div className="picker" ref={rootRef}>
      <label className="picker-label" htmlFor={inputId}>
        {t.pickerLabel}
      </label>

      <div className="picker-box">
        <input
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          className="picker-input"
          placeholder={t.pickerPlaceholder}
          value={query}
          disabled={nothingLeft}
          aria-expanded={listOpen}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />

        {listOpen && (
          <ul className="picker-list" id={listId} role="listbox">
            {matches.length === 0 && (
              <li className="picker-none" role="presentation">
                {t.pickerNone(query.trim())}
              </li>
            )}

            {matches.map((item, index) => (
              <li key={item.id} role="presentation">
                <button
                  type="button"
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className={`picker-opt${index === active ? ' on' : ''}`}
                  // The input keeps focus, so the list must not steal it on the
                  // way down — otherwise the click lands after a blur closes it.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(item)}
                >
                  <span className="picker-opt-name">{item.name}</span>
                  <span className="picker-opt-stock">{formatQuantity(item.stock, item.unit)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="picker-hint">{nothingLeft ? t.pickerDone : t.pickerHint(ingredients.length)}</p>

      {/* Announced only when the count changes, so a screen reader hears how
          many matches there are without every keystroke being read back. */}
      <span className="sr-only" role="status">
        {listOpen && matches.length > 0 ? t.pickerCount(matches.length) : ''}
      </span>
    </div>
  )
}
