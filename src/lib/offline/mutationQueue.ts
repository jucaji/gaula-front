import { customFetch } from '@/api/client'
import { ApiError } from '@/api/problem'
import { offlineDb, type MultipartField } from './db'

/**
 * HONESTIDAD DELIBERADA sobre qué tan "segura" es la reproducción: el
 * `Idempotency-Key` sólo lo entiende hoy `POST /case-files` (S2.ADI.03,
 * Sprint 2) -- `actions`/`evidence` de este mismo módulo NO tienen
 * confirmada esa protección del lado del servidor. Encolar y reproducir
 * una actuación o una evidencia sin esa protección puede duplicar el
 * efecto si la primera solicitud SÍ llegó a completarse en el servidor
 * pero la respuesta nunca volvió al cliente (la red cayó a mitad de
 * camino) -- riesgo real, no resuelto aquí, documentado para cuando el
 * backend lo cubra explícitamente para estas dos rutas.
 */
function buildRequestInit(mutation: {
  method: string
  kind: 'json' | 'multipart'
  jsonBody?: string | undefined
  multipartFields?: MultipartField[] | undefined
  idempotencyKey: string
}): RequestInit {
  if (mutation.kind === 'multipart') {
    const formData = new FormData()
    for (const field of mutation.multipartFields ?? []) {
      if (field.value instanceof Blob) {
        formData.append(field.key, field.value, field.filename)
      } else {
        formData.append(field.key, field.value)
      }
    }
    return { method: mutation.method, headers: { 'Idempotency-Key': mutation.idempotencyKey }, body: formData }
  }
  return { method: mutation.method, headers: { 'Idempotency-Key': mutation.idempotencyKey }, body: mutation.jsonBody ?? '' }
}

type EnqueueInput =
  | { url: string; method: string; kind: 'json'; body: unknown; label: string }
  | { url: string; method: string; kind: 'multipart'; fields: MultipartField[]; label: string }

/**
 * S8.FE.03/05/06: encola una mutación de campo. Si hay red, se intenta de
 * una -- la cola es el respaldo, no el camino feliz (mismo criterio que
 * `reportDraftStore`/`callDraftStore`: la fuente de verdad es el servidor).
 */
export async function enqueueMutation(input: EnqueueInput): Promise<{ sentImmediately: boolean }> {
  const idempotencyKey = crypto.randomUUID()
  const jsonBody = input.kind === 'json' ? JSON.stringify(input.body) : undefined
  const multipartFields = input.kind === 'multipart' ? input.fields : undefined

  if (navigator.onLine) {
    try {
      await customFetch(input.url, buildRequestInit({ method: input.method, kind: input.kind, jsonBody, multipartFields, idempotencyKey }))
      return { sentImmediately: true }
    } catch (err) {
      if (err instanceof ApiError) throw err // error real del servidor (422, 403…) -- no es un problema de red, no se encola
      // cualquier otro error (fetch lanzó, típicamente de red) sí se encola para reintentar después
    }
  }

  await offlineDb.mutations.add({
    idempotencyKey,
    url: input.url,
    method: input.method,
    kind: input.kind,
    jsonBody,
    multipartFields,
    label: input.label,
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
  })
  return { sentImmediately: false }
}

/** S8.FE.05: reproduce la cola en orden -- una mutación fallida por red vuelve a quedar `pending`, una rechazada por el servidor queda `failed` (no se reintenta sola para siempre). */
export async function drainQueue(): Promise<void> {
  if (!navigator.onLine) return
  const pending = await offlineDb.mutations.where('status').equals('pending').sortBy('createdAt')

  for (const mutation of pending) {
    if (mutation.id === undefined) continue
    await offlineDb.mutations.update(mutation.id, { status: 'syncing' })
    try {
      await customFetch(mutation.url, buildRequestInit(mutation))
      await offlineDb.mutations.delete(mutation.id)
    } catch (err) {
      if (err instanceof ApiError) {
        await offlineDb.mutations.update(mutation.id, {
          status: 'failed',
          attempts: mutation.attempts + 1,
          lastError: err.problem.detail,
        })
      } else {
        // sigue sin red (o volvió a caer a mitad de la reproducción) -- vuelve a `pending`, se reintenta en el próximo ciclo
        await offlineDb.mutations.update(mutation.id, { status: 'pending', attempts: mutation.attempts + 1 })
        return // no sigue con el resto de la cola si la red ya no responde
      }
    }
  }
}

export function getQueueSnapshot() {
  return offlineDb.mutations.orderBy('createdAt').toArray()
}

/** S8.FE.05: un rechazo del servidor es terminal para `drainQueue` -- esto reabre el intento a mano. */
export async function retryFailedMutation(id: number): Promise<void> {
  await offlineDb.mutations.update(id, { status: 'pending' })
}

export async function discardFailedMutation(id: number): Promise<void> {
  await offlineDb.mutations.delete(id)
}
