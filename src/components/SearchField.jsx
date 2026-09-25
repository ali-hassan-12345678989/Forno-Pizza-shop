import { SearchIcon } from './icons'
import './SearchField.css'

/**
 * The search box above a staff table.
 *
 * Four screens had their own copy of this — the same label, the same
 * hand-written magnifying-glass SVG, the same input — which is four places to
 * fix anything and three chances to miss one. It had already gone wrong: the
 * styling lived in StockTable.css and only ever reached the one screen that
 * imported it.
 *
 * `id` is required rather than generated so the caller can keep it stable
 * across renders; the label is visually hidden but read aloud, and doubles as
 * the placeholder so the field is not blank and unexplained.
 */
export default function SearchField({ id, label, value, onChange }) {
  return (
    <div className="stock-search">
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <SearchIcon className="stock-search-icon" />
      <input
        id={id}
        type="search"
        value={value}
        placeholder={label}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
