/**
 * S6.FE.03: autoguardado del payload del reporte en IndexedDB mientras el
 * operador lo llena -- antes de que exista un `OperationalReport` real en
 * el servidor (`SaveReportDraftService` valida el `payload` COMPLETO en
 * cada `POST`/`PUT`, así que un borrador a medio llenar puede pasar
 * minutos sin lograr guardarse ahí). Red de seguridad ante cierre
 * accidental, nunca la fuente de verdad -- eso es el reporte ya creado en
 * el servidor.
 */

const DB_NAME = 'gaula-report-drafts'
const STORE_NAME = 'drafts'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveReportDraft(key: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(payload, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // sin red de seguridad esta vez -- si el operador sigue en la página, el payload sigue en memoria
  }
}

export async function loadReportDraft(key: string): Promise<Record<string, unknown> | undefined> {
  try {
    const db = await openDb()
    const value = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(key)
      request.onsuccess = () => resolve(request.result as Record<string, unknown> | undefined)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return value
  } catch {
    return undefined
  }
}

export async function clearReportDraft(key: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // limpieza best-effort -- una entrada vieja huérfana no daña nada
  }
}
