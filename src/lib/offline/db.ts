import Dexie, { type EntityTable } from 'dexie'

/**
 * S8.FE.03 (SPEC-0209, docs/06 §8.3): la cola de mutaciones del campo sin
 * red. Dexie en vez de IndexedDB nativo (a diferencia de `callDraftStore`/
 * `reportDraftStore`, Sprint 4/6) porque aquí SÍ hace falta consultar por
 * `status` para pintar la cola pendiente en el `OfflineBanner` -- una
 * consulta indexada real, no sólo `get`/`put` por clave -- y porque
 * adjuntar evidencia necesita guardar un `Blob` (el archivo en sí), que
 * Dexie soporta de forma nativa y `indexedDB` crudo habría que envolver a mano.
 */
export type QueuedMutationStatus = 'pending' | 'syncing' | 'failed'

export interface MultipartField {
  key: string
  value: string | Blob
  filename?: string
}

export interface QueuedMutation {
  id?: number
  idempotencyKey: string
  url: string
  method: string
  kind: 'json' | 'multipart'
  jsonBody?: string | undefined
  multipartFields?: MultipartField[] | undefined
  label: string
  status: QueuedMutationStatus
  attempts: number
  lastError?: string | undefined
  createdAt: string
}

export const offlineDb = new Dexie('gaula-offline-queue') as Dexie & {
  mutations: EntityTable<QueuedMutation, 'id'>
}

offlineDb.version(1).stores({
  mutations: '++id, status, createdAt',
})
