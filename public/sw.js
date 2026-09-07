/**
 * S8.FE.05: sólo Background Sync -- avisa a las pestañas abiertas para que
 * reproduzcan la cola de Dexie (la lógica de la cola vive en la página, no
 * aquí, para no duplicarla en dos contextos). El precaching del app shell
 * (recarga completa sin red) queda fuera de esta pasada -- exigiría un
 * plugin de build (vite-plugin-pwa/Workbox) que este proyecto no tiene
 * instalado todavía; sin él, un Service Worker escrito a mano no puede
 * conocer los nombres de archivo con hash del build de forma confiable.
 * El respaldo real de "opera sin red" hoy es la cola de Dexie + el evento
 * `online` del navegador (`useSyncQueue`), no este archivo.
 */
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('sync', (event) => {
  if (event.tag === 'gaula-sync-queue') {
    event.waitUntil(notifyClientsToSync())
  }
})

async function notifyClientsToSync() {
  const allClients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
  for (const client of allClients) {
    client.postMessage({ type: 'GAULA_SYNC_QUEUE' })
  }
}
