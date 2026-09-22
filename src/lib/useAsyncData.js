import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Load something once, keep the pieces every staff section needs to render it:
 * the data, a mapped error code, whether it is loading, and a way to ask again.
 *
 * `silent` reloads leave the current data on screen and skip the loading
 * state. That matters where a form sits above the data it changes — Part 4
 * task 4 shipped a bug where refreshing the stock table tore the book-in form
 * down mid-confirmation, so the Manager never saw what they had just done.
 *
 * The loader is expected to resolve rather than throw, returning whatever
 * shape the api/ module defines; a thrown error is still caught so one bad
 * response cannot blank the whole panel.
 */
export function useAsyncData(loader) {
  const [data, setData] = useState(null)
  const [errorCode, setErrorCode] = useState(null)
  const [loading, setLoading] = useState(true)

  // Kept in a ref so `load` has a stable identity: callers pass it straight to
  // onClick and to child components, and a new function every render would
  // restart the effect on a loop.
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setErrorCode(null)

    try {
      const result = await loaderRef.current()
      if (!aliveRef.current) return
      setData(result.data ?? null)
      setErrorCode(result.errorCode ?? null)
    } catch {
      if (!aliveRef.current) return
      setErrorCode('unknown')
    } finally {
      if (aliveRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { data, errorCode, loading, reload: load }
}
