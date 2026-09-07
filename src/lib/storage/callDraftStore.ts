/**
 * S4.FE.05: autoguardado del relato en IndexedDB, con debounce de 3 s --
 * nunca en localStorage (el relato de una llamada de extorsión/secuestro no
 * es algo que valga la pena arriesgar a un límite de tamaño ni a quedar en
 * texto plano fácil de inspeccionar por cualquier script de la página).
 * IndexedDB puede fallar (contexto no seguro, cuota agotada, navegación
 * privada) -- cada función atrapa el error y no interrumpe el flujo: esto
 * es una red de seguridad, nunca la fuente de verdad (esa es el `PATCH`
 * real al servidor).
 */

const DB_NAME = 'gaula-call-drafts'
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

export async function saveDraft(callId: string, narrative: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(narrative, callId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // sin red de seguridad esta vez -- el PATCH al servidor sigue siendo la fuente real
  }
}

export async function loadDraft(callId: string): Promise<string | undefined> {
  try {
    const db = await openDb()
    const value = await new Promise<string | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(callId)
      request.onsuccess = () => resolve(request.result as string | undefined)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return value
  } catch {
    return undefined
  }
}

export async function clearDraft(callId: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(callId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // limpieza best-effort -- una entrada vieja huérfana no daña nada
  }
}
