import { useEffect } from 'react'

/**
 * Keeps a staff screen current without anyone pressing anything.
 *
 * Two triggers, because they answer different moments. The interval covers the
 * screen left open on the kitchen counter; the visibility listener covers the
 * person who switched to another tab and came back, which is exactly when they
 * want to know and exactly when an interval is least likely to have just fired.
 * The customer's tracking page has used this pair since Part 3; this is the
 * same idea with a shorter clock.
 *
 * Refreshes are SILENT: useAsyncData keeps the current rows on screen instead
 * of dropping back to a loading state. A list that blanks itself every ten
 * seconds is unusable, and a Manager mid-sentence in a form would lose it.
 *
 * @param {Function} reload   from useAsyncData
 * @param {number}   everyMs  interval; pass 0 or null to stop polling
 */
export function useAutoRefresh(reload, everyMs) {
  useEffect(() => {
    if (!everyMs) return undefined

    const tick = () => reload({ silent: true })
    const timer = setInterval(tick, everyMs)

    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [reload, everyMs])
}
