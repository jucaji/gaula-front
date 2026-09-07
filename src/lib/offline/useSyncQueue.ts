import { useCallback, useEffect, useRef, useState } from 'react'
import type { QueuedMutation } from './db'
import { discardFailedMutation, drainQueue, getQueueSnapshot, retryFailedMutation } from './mutationQueue'
import { useOnlineStatus } from './useOnlineStatus'
import { listenForBackgroundSyncMessages, requestBackgroundSync } from './backgroundSync'

const POLL_MS = 2000

/**
 * S8.FE.04/05: sondeo simple en vez de suscribirse a los hooks internos de
 * Dexie -- esta cola sólo alimenta un banner de estado, no necesita
 * reactividad al milisegundo, y el sondeo evita depender de una API de
 * Dexie más frágil de mantener sincronizada.
 */
export function useSyncQueue(): {
  queue: QueuedMutation[]
  online: boolean
  lastSyncedAt: Date | null
  syncNow: () => void
  retryFailed: (id: number) => void
  discardFailed: (id: number) => void
} {
  const online = useOnlineStatus()
  const [queue, setQueue] = useState<QueuedMutation[]>([])
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const previousPendingCount = useRef(0)

  const refresh = useCallback(async () => {
    const snapshot = await getQueueSnapshot()
    setQueue(snapshot)
    return snapshot
  }, [])

  const syncNow = useCallback(() => {
    void (async () => {
      await drainQueue()
      const snapshot = await refresh()
      if (previousPendingCount.current > 0 && snapshot.length < previousPendingCount.current) {
        setLastSyncedAt(new Date())
      }
      previousPendingCount.current = snapshot.length
    })()
  }, [refresh])

  useEffect(() => {
    // `queueMicrotask` -- `refresh`/`syncNow` ya son asíncronas; esto sólo
    // evita el `setState` síncrono dentro del cuerpo del efecto.
    queueMicrotask(() => void refresh())
    const interval = setInterval(() => syncNow(), POLL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `syncNow` es estable entre renders (useCallback con deps fijas)
  }, [refresh])

  useEffect(() => {
    if (online) syncNow()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reintentar sólo cuando cambia el estado de red, no en cada render
  }, [online])

  useEffect(() => listenForBackgroundSyncMessages(() => syncNow()), [syncNow])

  return {
    queue,
    online,
    lastSyncedAt,
    syncNow: () => {
      syncNow()
      requestBackgroundSync()
    },
    retryFailed: (id: number) => {
      void (async () => {
        await retryFailedMutation(id)
        await refresh()
        syncNow()
      })()
    },
    discardFailed: (id: number) => {
      void (async () => {
        await discardFailedMutation(id)
        await refresh()
      })()
    },
  }
}
