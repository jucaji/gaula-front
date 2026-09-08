import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { customFetch } from '@/api/client'
import type { IncidentDashboard, IncidentProfile } from './types'

export interface DashboardFilters {
  from?: string | undefined
  to?: string | undefined
  departmentText?: string | undefined
  municipalityCode?: string | undefined
  authorGroup?: string | undefined
  modality?: string | undefined
  kidnappingType?: string | undefined
  victimStatus?: string | undefined
  occupation?: string | undefined
}

/**
 * SPEC-0807: los filtros se serializan en UN solo sitio.
 *
 * <p>Las cifras, el análisis y la exportación tienen que responder al mismo
 * filtro; cuando cada consulta armaba su propia URL, agregar un filtro era
 * acordarse de tocar las tres, y la que se olvidara devolvería un Excel que no
 * coincide con la pantalla que el analista está viendo.
 */
export function dashboardSearchParams(profile: IncidentProfile, filters: DashboardFilters): URLSearchParams {
  const params = new URLSearchParams({ profile })
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === 'string' && value.trim() !== '') params.set(key, value)
  }
  return params
}

/**
 * SPEC-0803 CA-3: los filtros viven en la URL y de ahí salen para la consulta.
 * La clave de caché los incluye tal cual, así que pegar un enlace en otra
 * máquina produce exactamente la misma consulta y la misma vista.
 */
export function useIncidentDashboard(profile: IncidentProfile, filters: DashboardFilters) {
  return useQuery({
    queryKey: ['observatory', 'dashboard', profile, filters],
    queryFn: () =>
      customFetch<IncidentDashboard>(
        `/api/v1/observatory/dashboard?${dashboardSearchParams(profile, filters).toString()}`,
      ),
    // HALLAZGO REAL (verificado en vivo con la coropleta): sin esto, cada cambio
    // de filtro deja `data` en `undefined` mientras vuela la consulta, el tablero
    // entero se DESMONTA y se vuelve a montar. Se veía como un parpadeo, pero el
    // daño real era que el mapa perdía su estado: filtrar por un departamento
    // desde la coropleta devolvía la vista a "Municipios", justo después de hacer
    // clic en el departamento. Conservar el dato anterior mientras llega el nuevo
    // mantiene la pantalla en pie.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    networkMode: 'always',
    retry: false,
  })
}

export function dashboardExportUrl(profile: IncidentProfile, filters: DashboardFilters): string {
  return `/api/v1/observatory/dashboard/export?${dashboardSearchParams(profile, filters).toString()}`
}
