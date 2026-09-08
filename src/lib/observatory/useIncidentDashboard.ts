import { useQuery } from '@tanstack/react-query'
import { customFetch } from '@/api/client'
import type { IncidentDashboard, IncidentProfile } from './types'

export interface DashboardFilters {
  from?: string | undefined
  to?: string | undefined
  departmentText?: string | undefined
  municipalityCode?: string | undefined
  authorGroup?: string | undefined
}

/**
 * SPEC-0803 CA-3: los filtros viven en la URL y de ahí salen para la consulta.
 * La clave de caché los incluye tal cual, así que pegar un enlace en otra
 * máquina produce exactamente la misma consulta y la misma vista.
 */
export function useIncidentDashboard(profile: IncidentProfile, filters: DashboardFilters) {
  return useQuery({
    queryKey: ['observatory', 'dashboard', profile, filters],
    queryFn: () => {
      const params = new URLSearchParams({ profile })
      if (filters.from) params.set('from', filters.from)
      if (filters.to) params.set('to', filters.to)
      if (filters.departmentText) params.set('departmentText', filters.departmentText)
      if (filters.municipalityCode) params.set('municipalityCode', filters.municipalityCode)
      if (filters.authorGroup) params.set('authorGroup', filters.authorGroup)
      return customFetch<IncidentDashboard>(`/api/v1/observatory/dashboard?${params.toString()}`)
    },
    staleTime: 30_000,
    networkMode: 'always',
    retry: false,
  })
}

export function dashboardExportUrl(profile: IncidentProfile, filters: DashboardFilters): string {
  const params = new URLSearchParams({ profile })
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.departmentText) params.set('departmentText', filters.departmentText)
  if (filters.municipalityCode) params.set('municipalityCode', filters.municipalityCode)
  if (filters.authorGroup) params.set('authorGroup', filters.authorGroup)
  return `/api/v1/observatory/dashboard/export?${params.toString()}`
}
