import { useQuery } from '@tanstack/react-query'
import { customFetch } from '@/api/client'
import type { IncidentAnalysis, IncidentProfile } from './types'
import type { DashboardFilters } from './useIncidentDashboard'

/**
 * SPEC-0805 CA-2: el análisis es un ADORNO de las cifras, no su fuente. Va en su
 * propia consulta a propósito -- si el servicio de análisis está caído, el
 * tablero ya se pintó completo y esta consulta sólo agrega (o explica su
 * ausencia). Nunca al revés.
 */
export function useIncidentAnalysis(profile: IncidentProfile, filters: DashboardFilters) {
  return useQuery({
    queryKey: ['observatory', 'analysis', profile, filters],
    queryFn: () => {
      const params = new URLSearchParams({ profile })
      if (filters.from) params.set('from', filters.from)
      if (filters.to) params.set('to', filters.to)
      if (filters.departmentText) params.set('departmentText', filters.departmentText)
      if (filters.municipalityCode) params.set('municipalityCode', filters.municipalityCode)
      if (filters.authorGroup) params.set('authorGroup', filters.authorGroup)
      return customFetch<IncidentAnalysis>(`/api/v1/observatory/dashboard/analysis?${params.toString()}`)
    },
    staleTime: 60_000,
    networkMode: 'always',
    retry: false,
  })
}
