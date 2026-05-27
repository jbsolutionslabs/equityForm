import { useEffect, useRef, useCallback } from 'react'
import { useSaveIndicator } from '../../state/saveIndicatorStore'

const DEBOUNCE_MS = 1500

/**
 * Debounced auto-save hook.
 *
 * Usage:
 *   const { flush } = useAutoSave(dealId, data, async (data) => {
 *     await apiClient.put(`/deals/${dealId}/offering`, { payload: data })
 *   })
 *
 * - Debounces saves by DEBOUNCE_MS after data changes
 * - Updates the global SaveIndicator state
 * - Returns flush() for immediate save (e.g. on "Save" button click)
 * - Flushes automatically on unmount if there are pending changes
 */
export function useAutoSave<T>(
  key: string,
  data: T,
  saveFn: (data: T) => Promise<void>,
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled ?? true
  const { setPending, setSaving, setSaved, setError } = useSaveIndicator()

  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef  = useRef(false)
  const dataRef     = useRef(data)
  const saveFnRef   = useRef(saveFn)
  const mountedRef  = useRef(true)

  // Keep refs current without triggering effects
  dataRef.current   = data
  saveFnRef.current = saveFn

  const executeSave = useCallback(async () => {
    if (!mountedRef.current) return
    pendingRef.current = false
    setSaving()
    try {
      await saveFnRef.current(dataRef.current)
      if (mountedRef.current) setSaved()
    } catch (err) {
      console.error('[useAutoSave] save failed', err)
      if (mountedRef.current) setError()
    }
  }, [setSaving, setSaved, setError])

  // Debounce on data change
  useEffect(() => {
    if (!enabled) return

    // Skip the very first render (no change yet)
    if (!pendingRef.current && timerRef.current === null) {
      pendingRef.current = true
      return
    }

    pendingRef.current = true
    setPending()

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(executeSave, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data), enabled])

  // Flush on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (pendingRef.current) {
        if (timerRef.current) clearTimeout(timerRef.current)
        // Fire-and-forget on unmount
        saveFnRef.current(dataRef.current).catch(() => {})
      }
    }
  }, [])

  // Manual flush (e.g. "Save" button)
  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    await executeSave()
  }, [executeSave])

  return { flush }
}
