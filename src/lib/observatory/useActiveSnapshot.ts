import { useQuery } from '@tanstack/react-query'
import { customFetch } from '@/api/client'
import type { DatasetSnapshot } from './types'

export const ACTIVE_SNAPSHOT_KEY = ['observatory', 'snapshots', 'active'] as const

/**
 * S13.FE.03: el corte vigente. El backend responde `204` cuando todavía no se
 * ha cargado ninguno -- "no hay dato" es una respuesta legítima y la banda
 * tiene que decirlo, no quedarse en blanco.
 *
 * HALLAZGO REAL (S13.FE.03, encontrado con la prueba del `204`): `customFetch`
 * traduce el `204` a `undefined`, y React Query trata `undefined` como error
 * ("Query data cannot be undefined"). La banda mostraba entonces "no se pudo
 * consultar el corte vigente" -- acusaba una falla de red -- cuando lo que
 * pasaba era que todavía no se ha cargado ningún corte. Normalizar a `null`
 * aquí mantiene la diferencia entre "no hay dato" y "no se pudo preguntar",
 * que es justo lo que esta banda existe para no confundir.
 */
export function useActiveSnapshot() {
  return useQuery({
    queryKey: ACTIVE_SNAPSHOT_KEY,
    queryFn: async () =>
      (await customFetch<DatasetSnapshot | undefined>('/api/v1/observatory/snapshots/active')) ?? null,
    staleTime: 30_000,
    networkMode: 'always',
    retry: false,
  })
}
