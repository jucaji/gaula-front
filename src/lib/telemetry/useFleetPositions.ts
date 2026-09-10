import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { customFetch } from '@/api/client'
import { unpackFleetSnapshot, type FleetPosition, type FleetSnapshotResponse } from './types'

/**
 * Cada cuánto se refresca el mapa cuando el seguimiento está activo.
 *
 * Diez segundos y no uno: a escala objetivo un proveedor reporta cada 30 s, así
 * que pedir más rápido de lo que el dato cambia sólo gasta ancho de banda y
 * batería. Cuando exista el canal de tiempo real (SPEC-0506 fase 4), este
 * sondeo pasa a ser la red de seguridad y no el camino principal.
 */
export const FLEET_REFRESH_MS = 10_000

export interface FleetSnapshot {
  observedAt: string
  positions: FleetPosition[]
  truncated: boolean
  total: number
}

export interface FleetPositionsOptions {
  /** Si el mapa se está actualizando solo. */
  live: boolean
}

export function useFleetPositions({ live }: FleetPositionsOptions) {
  return useQuery<FleetSnapshot>({
    queryKey: ['telemetry', 'fleet-positions'],
    queryFn: async () => {
      const snapshot = await customFetch<FleetSnapshotResponse>('/api/v1/telemetry/positions')
      return {
        observedAt: snapshot.observedAt,
        positions: unpackFleetSnapshot(snapshot),
        truncated: snapshot.truncated,
        total: snapshot.total,
      }
    },
    refetchInterval: live ? FLEET_REFRESH_MS : false,
    // Sin esto la pantalla entera se desmonta en cada refresco y el mapa
    // parpadea diez veces por minuto -- defecto ya vivido en SPEC-0807.
    placeholderData: keepPreviousData,
    staleTime: FLEET_REFRESH_MS / 2,
    networkMode: 'always',
    retry: false,
  })
}
