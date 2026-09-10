import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { customFetch } from '@/api/client'
import type { ProviderResponse, TripResponse, VehicleTelemetryResponse } from './types'
import { FLEET_REFRESH_MS } from './useFleetPositions'

/** El detalle de un vehículo. Refresca al mismo ritmo que el mapa cuando está en vivo. */
export function useVehicleTelemetry(vehicleId: string | null, live: boolean) {
  return useQuery<VehicleTelemetryResponse>({
    queryKey: ['telemetry', 'vehicle', vehicleId],
    queryFn: () => customFetch<VehicleTelemetryResponse>(`/api/v1/telemetry/vehicles/${vehicleId}`),
    enabled: Boolean(vehicleId),
    refetchInterval: live ? FLEET_REFRESH_MS : false,
    placeholderData: keepPreviousData,
    networkMode: 'always',
    retry: false,
  })
}

interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  pageNumber: number
  pageSize: number
}

/**
 * Los recorridos de un vehículo en un rango.
 *
 * **Esta consulta queda auditada en el backend** (SPEC-0506 CA-13), así que no
 * se dispara sola: sólo cuando el operador abre la pestaña de recorridos. Un
 * `useQuery` con `enabled` mal puesto llenaría la auditoría de consultas que
 * nadie pidió.
 */
export function useVehicleTrips(vehicleId: string | null, from: string, to: string, enabled: boolean) {
  return useQuery<PageResponse<TripResponse>>({
    queryKey: ['telemetry', 'trips', vehicleId, from, to],
    queryFn: () => {
      const params = new URLSearchParams({ from, to, page: '0', size: '50' })
      return customFetch<PageResponse<TripResponse>>(
        `/api/v1/telemetry/vehicles/${vehicleId}/trips?${params.toString()}`,
      )
    },
    enabled: enabled && Boolean(vehicleId),
    networkMode: 'always',
    retry: false,
  })
}

/**
 * Qué proveedores hay y qué entrega cada uno.
 *
 * Cambia sólo con un despliegue, así que se consulta una vez por sesión. Es lo
 * que permite escribir "este proveedor no entrega velocidad" en el sitio donde
 * iría la velocidad, en vez de dejar un hueco (CA-14).
 */
export function useTelemetryProviders() {
  return useQuery<ProviderResponse[]>({
    queryKey: ['telemetry', 'providers'],
    queryFn: () => customFetch<ProviderResponse[]>('/api/v1/telemetry/providers'),
    staleTime: Infinity,
    gcTime: Infinity,
    networkMode: 'always',
    retry: false,
  })
}
