/**
 * S8.FE.05: Background Sync como capa de MEJORA, nunca el único camino --
 * Safari no la implementa, y el registro de un `sync` no garantiza que
 * dispare pronto. El respaldo real y siempre disponible es el evento
 * `online` del navegador + el sondeo de `useSyncQueue`; esto sólo intenta
 * reproducir la cola un poco antes, o mientras la pestaña está en segundo
 * plano, cuando el navegador SÍ lo soporta.
 */
export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register('/sw.js')
  } catch {
    // sin soporte real o falla de registro -- la sincronización manual sigue funcionando igual
  }
}

interface SyncManager {
  register: (tag: string) => Promise<void>
}

export function requestBackgroundSync(): void {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.ready
    .then((registration) => {
      const withSync = registration as ServiceWorkerRegistration & { sync?: SyncManager }
      return withSync.sync?.register('gaula-sync-queue')
    })
    .catch(() => {
      // Background Sync no soportado en este navegador -- sin efecto, el sondeo normal sigue cubriendo el caso
    })
}

export function listenForBackgroundSyncMessages(onSync: () => void): () => void {
  if (!('serviceWorker' in navigator)) return () => undefined
  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'GAULA_SYNC_QUEUE') onSync()
  }
  navigator.serviceWorker.addEventListener('message', handler)
  return () => navigator.serviceWorker.removeEventListener('message', handler)
}
