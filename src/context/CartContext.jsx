import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { STORAGE_KEYS, readJSON, writeJSON } from '../config/storage'

const CartContext = createContext(null)

export const MAX_QUANTITY = 20

/**
 * A cart line is one item, at one size, with one set of extras.
 *
 * The size alone is no longer enough to identify it: a Large with extra cheese
 * and a plain Large are different products at different prices, and merging
 * them would quietly change what the customer ordered. Topping ids are sorted
 * so the same choices made in a different order still count as the same line.
 */
function lineKeyFor(sizeId, toppings) {
  const ids = toppings.map((topping) => topping.id).sort()
  return ids.length ? `${sizeId}:${ids.join(',')}` : sizeId
}

/** Extras are priced into the unit, so line total stays quantity x unit. */
function unitPriceFor(size, toppings) {
  return toppings.reduce((sum, topping) => sum + topping.price, size.price)
}

export function CartProvider({ children }) {
  const [lines, setLines] = useState(() => readJSON(STORAGE_KEYS.cart, []))

  useEffect(() => writeJSON(STORAGE_KEYS.cart, lines), [lines])

  const value = useMemo(() => {
    const count = lines.reduce((n, l) => n + l.quantity, 0)
    const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)

    return {
      lines,
      count,
      subtotal,
      isEmpty: lines.length === 0,

      addLine(item, size, toppings = [], quantity = 1) {
        const lineId = lineKeyFor(size.id, toppings)

        setLines((prev) => {
          const existing = prev.find((l) => l.lineId === lineId)

          if (existing) {
            return prev.map((l) =>
              l.lineId === lineId
                ? { ...l, quantity: Math.min(l.quantity + quantity, MAX_QUANTITY) }
                : l,
            )
          }

          return [
            ...prev,
            {
              lineId,
              sizeId: size.id,
              itemId: item.id,
              name: item.name,
              sizeLabel: size.label,
              basePrice: size.price,
              toppings: toppings.map((t) => ({ id: t.id, name: t.name, price: t.price })),
              unitPrice: unitPriceFor(size, toppings),
              imageUrl: item.imageUrl,
              quantity: Math.min(quantity, MAX_QUANTITY),
            },
          ]
        })
      },

      setQuantity(lineId, quantity) {
        const next = Math.max(0, Math.min(quantity, MAX_QUANTITY))
        setLines((prev) =>
          next === 0
            ? prev.filter((l) => l.lineId !== lineId)
            : prev.map((l) => (l.lineId === lineId ? { ...l, quantity: next } : l)),
        )
      },

      removeLine(lineId) {
        setLines((prev) => prev.filter((l) => l.lineId !== lineId))
      },

      clear() {
        setLines([])
      },
    }
  }, [lines])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
