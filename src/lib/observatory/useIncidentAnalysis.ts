import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { customFetch } from '@/api/client'
import type { IncidentAnalysis, IncidentProfile } from './types'
import { dashboardSearchParams, type DashboardFilters } from './useIncidentDashboard'

/**
 * SPEC-0805 CA-2: el análisis es un ADORNO de las cifras, no su fuente. Va en su
 * propia consulta a propósito -- si el servicio de análisis está caído, el
 * tablero ya se pintó completo y esta consulta sólo agrega (o explica su
 * ausencia). Nunca al revés.
 */
export function useIncidentAnalysis(profile: IncidentProfile, filters: DashboardFilters) {
  return useQuery({
    queryKey: ['observatory', 'analysis', profile, filters],
    queryFn: () =>
      customFetch<IncidentAnalysis>(
        `/api/v1/observatory/dashboard/analysis?${dashboardSearchParams(profile, filters).toString()}`,
      ),
    // Mismo motivo que el tablero: sin el dato anterior, el panel de análisis
    // desaparece y reaparece en cada filtro.
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    networkMode: 'always',
    retry: false,
  })
}
