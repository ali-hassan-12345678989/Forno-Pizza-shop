import { useEffect } from 'react'

/**
 * Keeps a screen current without anyone pressing anything.
 *
 * Two triggers, because they answer different moments. The interval covers the
 * screen left open on the kitchen counter; the visibility listener covers the
 * person who switched to another tab and came back, which is exactly when they
 * want to know and exactly when an interval is least likely to have just fired.
 *
 * NOTHING IS FETCHED WHILE THE TAB IS HIDDEN. That is what the guard in `tick`
 * is for, and it is worth saying plainly because this comment used to claim the
 * behaviour without the code doing it: the visibility listener only ever added
 * an EXTRA refresh on return, while the interval carried on firing into a tab
 * nobody was looking at. Four staff screens left open on a counter spent about
 * eleven thousand requests a shift on that.
 *
 * The pair still works because the two halves cover each other — the interval
 * skips while hidden, and `visibilitychange` fetches once on the way back, so
 * a screen is never stale for longer than it takes to look at it.
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

    const tick = () => {
      // The timer keeps ticking rather than being torn down and rebuilt on
      // every tab switch; browsers already throttle a background interval to
      // roughly once a minute, so skipping costs nothing and the listener
      // below is what makes the screen current again.
      if (document.hidden) return
      reload({ silent: true })
    }
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
