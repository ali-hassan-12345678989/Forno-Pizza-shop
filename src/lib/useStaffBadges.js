import { useCallback, useEffect, useState } from 'react'
import { fetchStockLevels } from '../api/inventory'
import { fetchActiveOrders } from '../api/activeOrders'
import { BADGE_SOURCES } from '../config/staffNav'

/**
 * The counts the sidebar shows beside a section.
 *
 * Only what this role's nav actually asks for is fetched — a Manager's sidebar
 * never mentions open orders, so nothing loads them. The point of a badge is
 * to answer "is anything wrong" before the person opens the page, so it is
 * worth one small request; it is not worth four.
 */
export function useStaffBadges(nav) {
  const wanted = new Set(nav.map((item) => item.badge).filter(Boolean))
  const wantsLowStock = wanted.has(BADGE_SOURCES.lowStock)
  const wantsOpenOrders = wanted.has(BADGE_SOURCES.openOrders)

  const [counts, setCounts] = useState({})

  const load = useCallback(async () => {
    const next = {}

    if (wantsLowStock) {
      const { rows } = await fetchStockLevels()
      if (rows) next[BADGE_SOURCES.lowStock] = rows.filter((r) => r.isLow).length
    }

    if (wantsOpenOrders) {
      const { groups } = await fetchActiveOrders()
      if (groups) {
        next[BADGE_SOURCES.openOrders] = groups.reduce((sum, g) => sum + g.count, 0)
      }
    }

    setCounts(next)
  }, [wantsLowStock, wantsOpenOrders])

  useEffect(() => {
    let cancelled = false
    load().catch(() => {
      // A badge is a convenience. If it cannot load, the sidebar simply shows
      // no number rather than the panel refusing to render around it.
      if (!cancelled) setCounts({})
    })
    return () => {
      cancelled = true
    }
  }, [load])

  return { counts, reload: load }
}
