import { useEffect, useMemo, useState } from 'react'
import { useCart, MAX_QUANTITY } from '../context/CartContext'
import { COPY } from '../content/copy'
import { sizedImage, IMAGE_SIZES } from '../content/images'
import { formatPrice } from '../lib/format'
import { useDialog } from '../lib/useDialog'
import { CloseIcon, CheckIcon } from './icons'
import './ItemModal.css'

/**
 * Pick a size, add extras, choose how many.
 *
 * A native <dialog>, for the same reason AuthModal is one: showModal() brings
 * focus trapping, an inert background and Escape-to-close from the platform.
 *
 * Nothing here decides a price. The running total is a preview built from the
 * same numbers the menu was loaded with; place_order() prices the order again
 * from the database on submit.
 */
export default function ItemModal({ item, open, onClose }) {
  const { addLine } = useCart()
  const t = COPY.item

  const { ref, dialogProps } = useDialog(open, onClose)
  const sizes = item?.sizes ?? []
  const toppings = item?.toppings ?? []
  const soldOut = Boolean(item?.isSoldOut) || sizes.length === 0

  const [sizeId, setSizeId] = useState(null)
  const [chosen, setChosen] = useState([])
  const [quantity, setQuantity] = useState(1)

  // Reopening the same item should not inherit the last visit's choices.
  // Reopening the same item should not inherit the last visit's choices, and
  // opening a different one should not inherit the last one's scroll position.
  // The dialog element is not the scroll container — .itemmodal-body is — so
  // resetting the dialog's own scrollTop did nothing.
  useEffect(() => {
    if (!open) return
    setSizeId(sizes[0]?.id ?? null)
    setChosen([])
    setQuantity(1)
    ref.current?.querySelector('.itemmodal-body')?.scrollTo({ top: 0 })
    // sizes is derived from item, which is already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id])

  const size = sizes.find((s) => s.id === sizeId) ?? sizes[0] ?? null

  const unitPrice = useMemo(
    () => (size ? chosen.reduce((sum, x) => sum + x.price, size.price) : 0),
    [size, chosen],
  )

  if (!open || !item) return null

  const toggleTopping = (topping) =>
    setChosen((prev) =>
      prev.some((x) => x.id === topping.id)
        ? prev.filter((x) => x.id !== topping.id)
        : [...prev, topping],
    )

  function handleAdd() {
    if (!size || soldOut) return
    addLine(item, size, chosen, quantity)
    onClose()
  }

  const image = sizedImage(item.imageUrl, IMAGE_SIZES.menuCard)

  return (
    <dialog {...dialogProps} className="itemmodal">
      <div className="itemmodal-panel">
        <button type="button" className="itemmodal-close" onClick={onClose} aria-label={t.close}>
          <CloseIcon />
        </button>

        {image && (
          <img className="itemmodal-pic" src={image} alt={item.name} width="600" height="375" />
        )}

        <div className="itemmodal-head">
          <h2>{item.name}</h2>
          {item.description && <p>{item.description}</p>}
          <strong className="itemmodal-price">{formatPrice(unitPrice)}</strong>
        </div>

        <div className="itemmodal-body">
          {sizes.length > 0 && (
            <section className="itemmodal-step">
              <h3 className="steprow">
                <span className="steprow-n">{t.sizeStepLabel}</span>
                <span className="steprow-t">{t.sizeHeading}</span>
                <span className="steprow-req">{t.required}</span>
              </h3>

              <div className="sizegrid" role="radiogroup" aria-label={t.sizeHeading}>
                {sizes.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={s.id === size?.id}
                    className={`sizeopt${s.id === size?.id ? ' on' : ''}`}
                    onClick={() => setSizeId(s.id)}
                    disabled={soldOut}
                  >
                    <span className="sizeopt-name">{s.label}</span>
                    <span className="sizeopt-price">{formatPrice(s.price)}</span>
                    {s.serves && <span className="sizeopt-serves">{s.serves}</span>}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Burgers and sides carry no toppings, so the step is absent rather
              than present and empty. */}
          {toppings.length > 0 && (
            <section className="itemmodal-step">
              <h3 className="steprow">
                <span className="steprow-n steprow-n-more">{t.toppingsStepLabel}</span>
                <span className="steprow-t">{t.toppingsHeading}</span>
                <span className="steprow-req steprow-opt">{t.optional}</span>
              </h3>

              <div className="topgroup" role="group" aria-label={t.toppingsGroupLabel}>
                {toppings.map((topping) => {
                  const on = chosen.some((x) => x.id === topping.id)
                  return (
                    <button
                      key={topping.id}
                      type="button"
                      className={`topopt${on ? ' on' : ''}`}
                      onClick={() => toggleTopping(topping)}
                      aria-pressed={on}
                      disabled={soldOut}
                    >
                      <span className="topopt-box" aria-hidden="true">
                        {on && <CheckIcon />}
                      </span>
                      <span className="topopt-name">{topping.name}</span>
                      <span className="topopt-price">
                        {topping.price > 0 ? t.plusPrice(formatPrice(topping.price)) : t.free}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        <div className="itemmodal-foot">
          <div className="itemmodal-qty" role="group" aria-label={t.quantityLabel}>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              aria-label={t.decrease}
            >
              −
            </button>
            <span>{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
              disabled={quantity >= MAX_QUANTITY}
              aria-label={t.increase}
            >
              +
            </button>
          </div>

          <button
            type="button"
            className="itemmodal-add"
            onClick={handleAdd}
            disabled={soldOut || !size}
          >
            <span>{soldOut ? t.unavailable : t.addToOrder}</span>
            {!soldOut && (
              <span className="itemmodal-total">{formatPrice(unitPrice * quantity)}</span>
            )}
          </button>
        </div>

        {quantity >= MAX_QUANTITY && <p className="itemmodal-max">{t.maxReached(MAX_QUANTITY)}</p>}
      </div>
    </dialog>
  )
}
