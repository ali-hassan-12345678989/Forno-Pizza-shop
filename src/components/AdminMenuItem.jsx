import { useState } from 'react'
import { COPY } from '../content/copy'
import {
  MAX_ITEM_DESCRIPTION,
  MAX_ITEM_NAME,
  MAX_ITEM_PRICE,
  MAX_SHORT_TEXT,
  PRICE_DECIMALS,
} from '../config/menuAdmin'
import { deleteMenuItem, deleteMenuSize, saveMenuItem, saveMenuSize } from '../api/adminMenu'
import { formatPrice } from '../lib/format'

const BLANK_SIZE = { id: null, size: '', price: '', serves: '', sortOrder: 0 }

/**
 * One menu item, collapsed to a summary until the Admin opens it.
 *
 * out_of_stock is shown and never offered as a control. Part 3 gave that flag
 * to the inventory engine; a hand-set value would simply be overwritten by
 * the next stock movement, so a toggle here would be a lie.
 */
export default function AdminMenuItem({ item, onChanged, defaultOpen = false }) {
  const t = COPY.staff.menu
  const [open, setOpen] = useState(defaultOpen)
  const [draft, setDraft] = useState(item)
  const [sizeDraft, setSizeDraft] = useState(BLANK_SIZE)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const isNew = !item.id

  function field(key, value) {
    setDraft((d) => ({ ...d, [key]: value }))
    setError(null)
  }

  async function save() {
    setBusy(true)
    const { errorCode } = await saveMenuItem(draft)
    setBusy(false)
    if (errorCode) return setError(t.errors[errorCode] ?? t.errors.unknown)
    setOpen(false)
    onChanged()
  }

  async function remove() {
    // eslint-disable-next-line no-alert
    if (!window.confirm(t.confirmRemove(item.name))) return
    setBusy(true)
    const { errorCode } = await deleteMenuItem(item.id)
    setBusy(false)
    if (errorCode) return setError(t.errors[errorCode] ?? t.errors.unknown)
    onChanged()
  }

  async function saveSize(size) {
    setBusy(true)
    const { errorCode } = await saveMenuSize({ ...size, menuItemId: item.id })
    setBusy(false)
    if (errorCode) return setError(t.errors[errorCode] ?? t.errors.unknown)
    setSizeDraft(BLANK_SIZE)
    onChanged()
  }

  async function removeSize(id) {
    setBusy(true)
    const { errorCode } = await deleteMenuSize(id)
    setBusy(false)
    if (errorCode) return setError(t.errors[errorCode] ?? t.errors.unknown)
    onChanged()
  }

  return (
    <li className={`amenu-item${item.isActive ? '' : ' hidden-item'}`}>
      <div className="amenu-row">
        <div className="amenu-id">
          <strong>{item.name || t.newItem}</strong>
          <span className="amenu-meta">
            {item.category}
            {item.sizes.length > 0 &&
              ` · ${item.sizes.length} size${item.sizes.length === 1 ? '' : 's'}`}
          </span>
        </div>

        <div className="amenu-flags">
          {!item.isActive && <span className="amenu-pill hidden">{t.statusHidden}</span>}
          {item.isSoldOut && <span className="amenu-pill sold">{t.statusSoldOut}</span>}
          {item.outOfStock && <span className="amenu-pill auto">{t.statusOutOfStock}</span>}
          {item.isActive && !item.isSoldOut && !item.outOfStock && (
            <span className="amenu-pill live">{t.statusLive}</span>
          )}
        </div>

        <button type="button" className="btn-ghost" onClick={() => setOpen((o) => !o)}>
          {open ? t.done : t.edit}
        </button>
      </div>

      {open && (
        <div className="amenu-edit">
          <div className="field">
            <label htmlFor={`n-${item.id}`}>{t.fieldName}</label>
            <div className="field-input">
              <input
                id={`n-${item.id}`}
                maxLength={MAX_ITEM_NAME}
                value={draft.name}
                onChange={(e) => field('name', e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor={`d-${item.id}`}>{t.fieldDescription}</label>
            <div className="field-input">
              <textarea
                id={`d-${item.id}`}
                rows={2}
                maxLength={MAX_ITEM_DESCRIPTION}
                value={draft.description}
                onChange={(e) => field('description', e.target.value)}
              />
            </div>
          </div>

          <div className="amenu-grid">
            <div className="field">
              <label htmlFor={`c-${item.id}`}>{t.fieldCategory}</label>
              <div className="field-input">
                <input
                  id={`c-${item.id}`}
                  maxLength={MAX_SHORT_TEXT}
                  value={draft.category}
                  onChange={(e) => field('category', e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor={`b-${item.id}`}>{t.fieldBadge}</label>
              <div className="field-input">
                <input
                  id={`b-${item.id}`}
                  maxLength={MAX_SHORT_TEXT}
                  value={draft.badge}
                  onChange={(e) => field('badge', e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor={`o-${item.id}`}>{t.fieldSortOrder}</label>
              <div className="field-input">
                <input
                  id={`o-${item.id}`}
                  type="number"
                  value={draft.sortOrder}
                  onChange={(e) => field('sortOrder', Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div className="field">
            <label htmlFor={`i-${item.id}`}>{t.fieldImage}</label>
            <div className="field-input">
              <input
                id={`i-${item.id}`}
                value={draft.imageUrl}
                onChange={(e) => field('imageUrl', e.target.value)}
              />
            </div>
          </div>

          <label className="amenu-check">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => field('isActive', e.target.checked)}
            />
            {t.fieldActive}
          </label>

          <label className="amenu-check">
            <input
              type="checkbox"
              checked={draft.isSoldOut}
              onChange={(e) => field('isSoldOut', e.target.checked)}
            />
            {t.fieldSoldOut}
          </label>

          {isNew && <p className="amenu-auto">{t.newItemHidden}</p>}

          {item.outOfStock && (
            <p className="amenu-auto">
              <strong>{t.autoSoldOut}</strong>
              <br />
              {t.autoSoldOutNote}
            </p>
          )}

          {!isNew && (
            <section className="amenu-sizes">
              <h4>{t.sizes}</h4>
              {item.sizes.length === 0 && <p className="amenu-nosizes">{t.noSizes}</p>}
              <ul>
                {item.sizes.map((s) => (
                  <SizeRow
                    key={s.id}
                    size={s}
                    onSave={saveSize}
                    onRemove={removeSize}
                    busy={busy}
                  />
                ))}
                <SizeRow
                  size={sizeDraft}
                  isNew
                  onSave={saveSize}
                  busy={busy}
                  onDraft={(next) => setSizeDraft(next)}
                />
              </ul>
            </section>
          )}

          {error && (
            <p className="form-alert" role="alert">
              {error}
            </p>
          )}

          <div className="amenu-actions">
            <button type="button" className="btn-solid" onClick={save} disabled={busy}>
              {busy ? t.saving : t.save}
            </button>
            {!isNew && (
              <button
                type="button"
                className="btn-ghost danger"
                onClick={remove}
                disabled={busy || item.orderCount > 0}
                title={item.orderCount > 0 ? t.cannotDelete : undefined}
              >
                {t.remove}
              </button>
            )}
            {item.orderCount > 0 && <span className="amenu-note">{t.cannotDelete}</span>}
          </div>
        </div>
      )}
    </li>
  )
}

function SizeRow({ size, isNew = false, onSave, onRemove, onDraft, busy }) {
  const t = COPY.staff.menu
  const [local, setLocal] = useState(size)
  const current = isNew ? size : local
  const update = (next) => (isNew ? onDraft(next) : setLocal(next))

  return (
    <li className="amenu-size">
      <input
        aria-label={t.fieldSize}
        placeholder={t.fieldSize}
        maxLength={MAX_SHORT_TEXT}
        value={current.size}
        onChange={(e) => update({ ...current, size: e.target.value })}
      />
      <input
        aria-label={t.fieldPrice}
        placeholder={t.fieldPrice}
        type="number"
        min="0"
        max={MAX_ITEM_PRICE}
        step={10 ** -PRICE_DECIMALS}
        value={current.price}
        onChange={(e) => update({ ...current, price: e.target.value })}
      />
      <input
        aria-label={t.fieldServes}
        placeholder={t.fieldServes}
        maxLength={MAX_SHORT_TEXT}
        value={current.serves}
        onChange={(e) => update({ ...current, serves: e.target.value })}
      />
      <button
        type="button"
        className="btn-ghost"
        disabled={busy}
        onClick={() => onSave({ ...current, price: Number(current.price) })}
      >
        {isNew ? t.addSize : t.save}
      </button>
      {!isNew && (
        <>
          <button
            type="button"
            className="btn-ghost danger"
            disabled={busy || size.orderCount > 0}
            title={size.orderCount > 0 ? t.errors.size_has_orders : undefined}
            onClick={() => onRemove(size.id)}
          >
            {t.remove}
          </button>
          <span className="amenu-size-note">
            {size.orderCount > 0 ? t.orderedTimes(size.orderCount) : formatPrice(size.price)}
          </span>
        </>
      )}
    </li>
  )
}
