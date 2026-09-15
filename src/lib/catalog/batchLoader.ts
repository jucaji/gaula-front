/**
 * SPEC-0108: junta en una sola petición las búsquedas que se piden en el mismo
 * instante.
 *
 * <p>Una bandeja de 20 casos pinta 20 celdas de municipio, y cada celda pide su
 * nombre por su cuenta (así cada una puede vivir en su columna, sin que la
 * pantalla sepa de catálogos). Sin esto serían 20 viajes al servidor; con esto
 * es uno. Los que no se encuentran se resuelven en `null`: quien pregunta
 * muestra el código.
 */
export function createBatchLoader<K, V>(
  fetchMany: (keys: K[]) => Promise<Map<K, V>>,
  { maxBatch = 100, delayMs = 0 }: { maxBatch?: number; delayMs?: number } = {},
) {
  type Waiting = { key: K; resolve: (value: V | null) => void; reject: (error: unknown) => void }
  let queue: Waiting[] = []
  let scheduled = false

  function flush() {
    const batch = queue
    queue = []
    scheduled = false
    const keys = [...new Set(batch.map((entry) => entry.key))]
    for (let start = 0; start < keys.length; start += maxBatch) {
      const chunk = keys.slice(start, start + maxBatch)
      const inChunk = new Set(chunk)
      const waiting = batch.filter((entry) => inChunk.has(entry.key))
      fetchMany(chunk).then(
        (found) => waiting.forEach((entry) => entry.resolve(found.get(entry.key) ?? null)),
        (error: unknown) => waiting.forEach((entry) => entry.reject(error)),
      )
    }
  }

  return {
    load(key: K): Promise<V | null> {
      return new Promise((resolve, reject) => {
        queue.push({ key, resolve, reject })
        if (!scheduled) {
          scheduled = true
          setTimeout(flush, delayMs)
        }
      })
    },
  }
}
