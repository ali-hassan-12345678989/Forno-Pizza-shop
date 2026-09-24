import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ConfirmDialog from './ConfirmDialog'
import MenuCard from './MenuCard'
import SaveBar from './SaveBar'
import { COPY } from '../content/copy'
import {
  MAX_ITEM_DESCRIPTION,
  MAX_ITEM_NAME,
  MAX_ITEM_PRICE,
  MAX_SHORT_TEXT,
  PRICE_DECIMALS,
} from '../config/menuAdmin'
import { STAFF_ROLES } from '../config/staff'
import { SECTION_IDS, detailPath, pathTo } from '../config/staffNav'
import { categoriesOf } from '../api/menu'
import { deleteMenuItem, deleteMenuSize, saveMenuItem, saveMenuSize } from '../api/adminMenu'
import { AVAILABILITY, applyAvailability, availabilityOf, statusOf } from '../lib/menuAvailability'
import {
  MOVE_DOWN,
  MOVE_UP,
  canMove,
  changesFor,
  isReordered,
  moveItem,
  positionOf,
} from '../lib/menuOrder'
import { tidyItem, tidySize } from '../lib/menuDraft'
import './AdminMenu.css'

/** Which confirmation is open, if any. */
const ASKING = { remove: 'remove', leave: 'leave', dropSize: 'dropSize' }

/**
 * Everything that has changed since the item was loaded, as one string.
 *
 * Deliberately crude: the save bar appearing when nothing changed is a small
 * annoyance, whereas it failing to appear leaves the Admin unable to save at
 * all. A whole-shape comparison cannot miss a field, and a field added later
 * joins it without anyone remembering to.
 */
function snapshotOf(fields, sizes) {
  return JSON.stringify({
    name: fields.name,
    description: fields.description,
    imageUrl: fields.imageUrl,
    category: fields.category,
    badge: fields.badge,
    isActive: fields.isActive,
    isSoldOut: fields.isSoldOut,
    sizes: sizes.map((size) => ({
      id: size.id,
      size: size.size,
      price: String(size.price),
      serves: size.serves,
    })),
  })
}

/**
 * FR-7.2, the editing half: one item, on its own URL.
 *
 * The main column is what the customer sees, in the order they see it; the side
 * column is everything about where it sits and whether it is on. Nothing writes
 * except the save bar at the bottom — the size rows lost their own Save buttons,
 * because a size is part of an item and not a record the Admin thinks about
 * separately.
 */
export default function MenuItemEditor({ item, items, onSaved }) {
  const t = COPY.staff.menu
  const navigate = useNavigate()
  const fieldId = useId()

  const isNew = !item.id
  const menuPath = pathTo(STAFF_ROLES.admin, SECTION_IDS.menu)

  const keySeed = useRef(0)
  const withKey = (size) => ({ ...size, key: size.id ?? `new-${(keySeed.current += 1)}` })

  const [draft, setDraft] = useState(item)
  const [sizes, setSizes] = useState(() => item.sizes.map(withKey))
  const [order, setOrder] = useState(items)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [asking, setAsking] = useState(null)

  const byId = useMemo(() => new Map(items.map((row) => [row.id, row])), [items])
  const categories = useMemo(() => categoriesOf(items), [items])

  // Only a move the Admin made counts as unsaved, and only a move makes this
  // save touch anyone else's row. changesFor() is non-empty on any menu whose
  // stored numbers have never been tidied, which is not something they did.
  const moved = isReordered(order, items)
  const orderChanges = useMemo(() => (moved ? changesFor(order) : []), [moved, order])
  const dirty = snapshotOf(draft, sizes) !== snapshotOf(item, item.sizes) || moved

  // Closing the tab is the one exit React cannot intercept, so the platform is
  // asked to. The in-app exits go through the back link's own confirmation.
  useEffect(() => {
    if (!dirty) return undefined

    const warn = (event) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function field(key, value) {
    setDraft((current) => ({ ...current, [key]: value }))
    setError(null)
    setSaved(false)
  }

  function editSize(key, patch) {
    setSizes((current) => current.map((size) => (size.key === key ? { ...size, ...patch } : size)))
    setError(null)
    setSaved(false)
  }

  function discard() {
    setDraft(item)
    setSizes(item.sizes.map(withKey))
    setOrder(items)
    setError(null)
    setSaved(false)
  }

  /**
   * One save, in the order the database needs it: the item first, because a new
   * one has no id for its sizes to hang off, then the sizes, then the
   * neighbours a move displaced. Stops at the first refusal and says which,
   * rather than carrying on and leaving a half-applied item behind.
   */
  async function persist(fields, rows, confirmRecipeLoss) {
    const mine = orderChanges.find((change) => change.id === item.id)
    // A new item goes to the end. sort_order defaults to 0, which would put a
    // brand-new item first on the customer menu — never what was meant.
    const sortOrder = mine?.sortOrder ?? (isNew ? items.length + 1 : fields.sortOrder)

    const written = await saveMenuItem({ ...fields, sortOrder })
    if (written.errorCode) return written

    const id = item.id ?? written.id

    const kept = new Set(rows.map((size) => size.id).filter(Boolean))
    for (const gone of item.sizes.filter((size) => !kept.has(size.id))) {
      const result = await deleteMenuSize(gone.id, { confirmRecipeLoss })
      if (result.errorCode) return result
    }

    const before = new Map(item.sizes.map((size) => [size.id, size]))
    for (const [index, size] of rows.entries()) {
      const was = size.id ? before.get(size.id) : null
      const unchanged =
        was &&
        was.size === size.size &&
        was.serves === size.serves &&
        was.price === Number(size.price)
      if (unchanged) continue

      const result = await saveMenuSize({
        id: size.id,
        menuItemId: id,
        size: size.size,
        price: Number(size.price),
        serves: size.serves,
        sortOrder: size.id ? size.sortOrder : index,
      })
      if (result.errorCode) return result
    }

    // A move renumbers whoever it displaced. Each is written back whole,
    // because admin_save_menu_item() takes the row rather than one column —
    // safe here only because this is a single-Admin shop.
    for (const change of orderChanges.filter((row) => row.id !== id)) {
      const neighbour = byId.get(change.id)
      if (!neighbour) continue

      const result = await saveMenuItem({ ...neighbour, sortOrder: change.sortOrder })
      if (result.errorCode) return result
    }

    return { id, errorCode: null }
  }

  /**
   * Sizes the Admin has taken out of the editor that really exist in the
   * database. A row added and removed in the same sitting has no id and has
   * nothing behind it to lose.
   */
  function sizesBeingDropped() {
    const kept = new Set(sizes.map((size) => size.id).filter(Boolean))
    return item.sizes.filter((size) => size.id && !kept.has(size.id))
  }

  async function save({ confirmRecipeLoss = false } = {}) {
    if (busy) return

    // Asked before anything is written, not after the database has refused.
    // The save is a batch — item, then deletions, then the remaining sizes —
    // so a refusal partway through would already have renamed the item, and
    // the Admin would be answering a question about a half-applied save.
    const dropping = sizesBeingDropped()
    if (dropping.length > 0 && !confirmRecipeLoss) {
      setAsking(ASKING.dropSize)
      return
    }

    setAsking(null)
    setBusy(true)
    setError(null)

    // Trim first, then save what was trimmed. The database does this itself, so
    // a draft still holding the untrimmed text would never match what comes
    // back and the save bar would never go away.
    const fields = tidyItem(draft)
    const rows = sizes.map(tidySize)
    setDraft(fields)
    setSizes(rows)

    const result = await persist(fields, rows, confirmRecipeLoss)

    if (result.errorCode) {
      // The draft is kept exactly as it was so the Admin can fix and retry.
      setBusy(false)
      setError(t.errors[result.errorCode] ?? t.errors.unknown)
      return
    }

    // Refetch before moving. A brand-new item is not in the list this page was
    // handed, so navigating to its URL first would land on "not on the menu"
    // until something else happened to reload.
    await onSaved()

    setBusy(false)
    setSaved(true)

    if (isNew) {
      navigate(detailPath(STAFF_ROLES.admin, SECTION_IDS.menu, result.id), { replace: true })
    }
  }

  async function remove() {
    setBusy(true)
    const { errorCode } = await deleteMenuItem(item.id)
    setBusy(false)
    setAsking(null)

    if (errorCode) return setError(t.errors[errorCode] ?? t.errors.unknown)
    navigate(menuPath)
  }

  function leave() {
    if (dirty) return setAsking(ASKING.leave)
    navigate(menuPath)
  }

  const status = statusOf({ ...draft, outOfStock: item.outOfStock })
  const availability = availabilityOf(draft)
  const place = positionOf(order, item.id)

  const previewItem = {
    ...draft,
    sizes: sizes.map((size) => ({ ...size, price: Number(size.price) || 0 })),
    // The customer cannot tell a hand-set sold-out from one the engine decided,
    // so neither does the preview.
    isSoldOut: draft.isSoldOut || item.outOfStock,
  }

  return (
    <div className="medit">
      <div className="medit-top">
        <button type="button" className="medit-back" onClick={leave}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M10 3 5 8l5 5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t.back}
        </button>

        <h1>{isNew ? t.newItem : item.name}</h1>
        {!isNew && <span className={`amenu-pill ${status}`}>{t.statuses[status]}</span>}
      </div>

      {isNew && <p className="medit-note">{t.newItemSub}</p>}

      <div className="medit-cols">
        <div className="medit-stack">
          <section className="medit-card" aria-labelledby={`${fieldId}-seen`}>
            <h2 id={`${fieldId}-seen`}>{t.cardCustomer}</h2>

            <div className="field">
              <label htmlFor={`${fieldId}-name`}>
                {t.fieldName}
                <span className="field-counter">
                  {draft.name.length}/{MAX_ITEM_NAME}
                </span>
              </label>
              <div className="field-input">
                <input
                  id={`${fieldId}-name`}
                  maxLength={MAX_ITEM_NAME}
                  value={draft.name}
                  onChange={(event) => field('name', event.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor={`${fieldId}-desc`}>
                {t.fieldDescription}
                <span className="field-counter">
                  {draft.description.length}/{MAX_ITEM_DESCRIPTION}
                </span>
              </label>
              <textarea
                id={`${fieldId}-desc`}
                className="medit-area"
                rows={3}
                maxLength={MAX_ITEM_DESCRIPTION}
                value={draft.description}
                onChange={(event) => field('description', event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor={`${fieldId}-img`}>{t.fieldImage}</label>
              <div className="field-input">
                <input
                  id={`${fieldId}-img`}
                  type="url"
                  value={draft.imageUrl}
                  onChange={(event) => field('imageUrl', event.target.value)}
                />
              </div>
              <span className="field-hint">{t.imageHint}</span>
            </div>
          </section>

          <section className="medit-card" aria-labelledby={`${fieldId}-sizes`}>
            <h2 id={`${fieldId}-sizes`}>{t.cardSizes}</h2>
            <p className="medit-sub">{t.sizesNote}</p>

            {sizes.length === 0 && <p className="medit-nosizes">{t.noSizes}</p>}

            {sizes.length > 0 && (
              <div className="msize-scroll">
                <table className="msize">
                  <thead>
                    <tr>
                      <th scope="col">{t.colSize}</th>
                      <th scope="col">{t.colPrice}</th>
                      <th scope="col">{t.colServes}</th>
                      <th scope="col">
                        <span className="sr-only">{t.remove}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sizes.map((size) => (
                      <SizeRow
                        key={size.key}
                        size={size}
                        onChange={(patch) => editSize(size.key, patch)}
                        onRemove={() =>
                          setSizes((current) => current.filter((row) => row.key !== size.key))
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button
              type="button"
              className="btn-ghost medit-addsize"
              onClick={() =>
                setSizes((current) => [
                  ...current,
                  withKey({ id: null, size: '', price: '', serves: '', sortOrder: current.length }),
                ])
              }
            >
              {t.addSize}
            </button>
          </section>

          <section className="medit-card danger" aria-labelledby={`${fieldId}-danger`}>
            <h2 id={`${fieldId}-danger`}>{t.cardDanger}</h2>
            <p className="medit-sub">
              {isNew
                ? t.deleteNotSaved
                : item.orderCount > 0
                  ? t.cannotDelete(item.name, item.orderCount)
                  : t.canDelete(item.name)}
            </p>
            <button
              type="button"
              className="btn-ghost medit-remove"
              disabled={isNew || item.orderCount > 0 || busy}
              onClick={() => setAsking(ASKING.remove)}
            >
              {busy && asking === ASKING.remove ? t.removing : t.remove}
            </button>
          </section>
        </div>

        <div className="medit-stack">
          <section className="medit-card" aria-labelledby={`${fieldId}-preview`}>
            <h2 id={`${fieldId}-preview`}>{t.cardPreview}</h2>
            {/* The customer's own card, not a drawing of one — so the preview
                cannot drift from the thing it is previewing. Inert, because
                nothing in here is meant to be clicked or tabbed into. */}
            <div className="medit-preview" inert>
              <MenuCard item={previewItem} rating={null} onOpen={() => {}} />
            </div>
            <span className="field-hint">{t.previewNote}</span>
          </section>

          <section className="medit-card" aria-labelledby={`${fieldId}-avail`}>
            <h2 id={`${fieldId}-avail`}>{t.cardAvailability}</h2>

            <div className="medit-choices" role="radiogroup" aria-labelledby={`${fieldId}-avail`}>
              {Object.values(AVAILABILITY).map((value) => (
                <label key={value} className={`medit-choice${availability === value ? ' on' : ''}`}>
                  <input
                    type="radio"
                    name={`${fieldId}-avail-choice`}
                    value={value}
                    checked={availability === value}
                    onChange={() => {
                      setDraft((current) => applyAvailability(current, value))
                      setError(null)
                      setSaved(false)
                    }}
                  />
                  <span>
                    <b>{t.availability[value]}</b>
                    <small>{t.availability[`${value}Note`]}</small>
                  </span>
                </label>
              ))}
            </div>

            {/* Shown, never editable: refresh_sold_out() owns this flag, and the
                choice above stays live so the Admin can still hide the item. */}
            {item.outOfStock && (
              <p className="medit-auto">
                <b>{t.autoSoldOut}</b>
                {t.autoSoldOutNote}
              </p>
            )}
          </section>

          <section className="medit-card" aria-labelledby={`${fieldId}-where`}>
            <h2 id={`${fieldId}-where`}>{t.cardPlacement}</h2>

            <div className="field">
              <label htmlFor={`${fieldId}-cat`}>{t.fieldCategory}</label>
              <div className="field-input">
                <input
                  id={`${fieldId}-cat`}
                  list={`${fieldId}-cats`}
                  maxLength={MAX_SHORT_TEXT}
                  value={draft.category}
                  onChange={(event) => field('category', event.target.value)}
                />
              </div>
              {/* Suggestions come from the menu itself, so the list never needs
                  maintaining and a new section is still just typed. */}
              <datalist id={`${fieldId}-cats`}>
                {categories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
              <span className="field-hint">{t.categoryHint}</span>
            </div>

            <div className="field">
              <label htmlFor={`${fieldId}-badge`}>{t.fieldBadge}</label>
              <div className="field-input">
                {/* A closed list, because MenuCard only draws a badge it has a
                    label for — anything else was silently dropped, which is
                    what made the old free-text box a trap. */}
                <select
                  id={`${fieldId}-badge`}
                  className="medit-select"
                  value={draft.badge}
                  onChange={(event) => field('badge', event.target.value)}
                >
                  <option value="">{t.badgeNone}</option>
                  {Object.entries(COPY.menu.badges).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <span className="field-hint">{t.badgeHint}</span>
            </div>

            <div className="field">
              <span className="medit-label">{t.fieldPosition}</span>
              {isNew ? (
                <span className="field-hint">{t.positionNew}</span>
              ) : (
                <>
                  <div className="medit-move">
                    <button
                      type="button"
                      className="medit-arrow"
                      aria-label={t.moveUp}
                      disabled={!canMove(order, item.id, MOVE_UP)}
                      onClick={() =>
                        setOrder((current) => moveItem(current, item.id, MOVE_UP).items)
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="medit-arrow"
                      aria-label={t.moveDown}
                      disabled={!canMove(order, item.id, MOVE_DOWN)}
                      onClick={() =>
                        setOrder((current) => moveItem(current, item.id, MOVE_DOWN).items)
                      }
                    >
                      ↓
                    </button>
                    <span className="medit-place" role="status">
                      {t.positionAt(t.positionOrdinal(place), order.length)}
                    </span>
                  </div>
                  <span className="field-hint">{t.positionHint}</span>
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      {error && (
        <p className="form-alert" role="alert">
          {error}
        </p>
      )}

      {saved && !dirty && (
        <p className="medit-saved" role="status">
          {t.saved}
        </p>
      )}

      <SaveBar
        visible={dirty}
        message={t.unsaved}
        saveLabel={busy ? t.saving : t.save}
        discardLabel={t.discard}
        busy={busy}
        onSave={() => save()}
        onDiscard={discard}
      />

      <ConfirmDialog
        open={asking === ASKING.remove}
        title={t.confirmRemoveTitle}
        body={t.confirmRemoveBody(item.name)}
        confirmLabel={t.confirmRemoveYes}
        cancelLabel={t.cancel}
        destructive
        busy={busy}
        onConfirm={remove}
        onCancel={() => setAsking(null)}
      />

      <ConfirmDialog
        open={asking === ASKING.dropSize}
        title={t.confirmDropSizeTitle}
        body={t.confirmDropSizeBody(
          sizesBeingDropped()
            .map((size) => `"${size.size}"`)
            .join(' and '),
        )}
        confirmLabel={t.confirmDropSizeYes}
        cancelLabel={t.cancel}
        destructive
        busy={busy}
        onConfirm={() => save({ confirmRecipeLoss: true })}
        onCancel={() => setAsking(null)}
      />

      <ConfirmDialog
        open={asking === ASKING.leave}
        title={t.confirmLeaveTitle}
        body={t.confirmLeaveBody}
        confirmLabel={t.confirmLeaveYes}
        cancelLabel={t.cancel}
        destructive
        onConfirm={() => navigate(menuPath)}
        onCancel={() => setAsking(null)}
      />
    </div>
  )
}

function SizeRow({ size, onChange, onRemove }) {
  const t = COPY.staff.menu
  const locked = size.orderCount > 0

  return (
    <tr>
      <td>
        <input
          className="msize-in"
          aria-label={t.colSize}
          maxLength={MAX_SHORT_TEXT}
          value={size.size}
          onChange={(event) => onChange({ size: event.target.value })}
        />
      </td>
      <td>
        <div className="msize-money">
          <span className="msize-pre">{t.pricePrefix}</span>
          <input
            aria-label={t.colPrice}
            type="number"
            min="0"
            max={MAX_ITEM_PRICE}
            step={10 ** -PRICE_DECIMALS}
            value={size.price}
            onChange={(event) => onChange({ price: event.target.value })}
          />
        </div>
      </td>
      <td>
        <input
          className="msize-in"
          aria-label={t.colServes}
          maxLength={MAX_SHORT_TEXT}
          value={size.serves}
          onChange={(event) => onChange({ serves: event.target.value })}
        />
      </td>
      <td className="msize-act">
        {locked ? (
          <span className="msize-locked" title={t.sizeLockedWhy}>
            {t.sizeLocked(size.orderCount)}
          </span>
        ) : (
          <button
            type="button"
            className="msize-drop"
            aria-label={t.removeSizeAria(size.size)}
            onClick={onRemove}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </td>
    </tr>
  )
}
