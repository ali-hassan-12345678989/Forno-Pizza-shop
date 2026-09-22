import { useCallback, useMemo, useState } from 'react'
import { addLine, removeLine, setQuantity } from './deliverySheet'

/**
 * Holds one delivery sheet, and hands back everything ReceiveStock needs.
 *
 * Two screens book in stock — the dashboard and the stock section — and each
 * has its own sheet. Bundling the state and the four handlers here means a call
 * site cannot pass half of them: when ReceiveStock's props changed, the
 * dashboard was still passing the old pair and rendered a blank page. Spreading
 * one object is harder to get half right than wiring four props by hand.
 */
export function useDeliverySheet() {
  const [lines, setLines] = useState([])

  const onAdd = useCallback((ingredientId) => {
    setLines((current) => addLine(current, ingredientId))
  }, [])

  const onRemove = useCallback((ingredientId) => {
    setLines((current) => removeLine(current, ingredientId))
  }, [])

  const onQuantity = useCallback((ingredientId, quantity) => {
    setLines((current) => setQuantity(current, ingredientId, quantity))
  }, [])

  /** For the stock table, so a row already on the sheet stops offering itself. */
  const queuedIds = useMemo(() => new Set(lines.map((line) => line.ingredientId)), [lines])

  return { sheet: { lines, onAdd, onRemove, onQuantity }, queuedIds, onBookIn: onAdd }
}
