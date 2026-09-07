import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'
import { customFetch } from '@/api/client'
import type { CaseFileResponse, PageResponseCaseFileResponse } from '@/api/generated/models'
import { TrackingNumberBadge } from '@/design-system/domain/TrackingNumberBadge'
import { CaseStatusChip } from '@/design-system/domain/CaseStatusChip'
import { EmptyState } from '@/design-system/patterns/EmptyState'
import { DataTable } from '@/design-system/primitives/DataTable'

// docs/07 §2: los filtros viven en la URL, tipados y validados con Zod.
const caseSearchSchema = z.object({
  page: z.number().catch(0),
  size: z.number().catch(20),
})

export const Route = createFileRoute('/casos/')({
  validateSearch: caseSearchSchema,
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'CASE_FILE')) {
      throw redirect({ to: '/', search: { denied: 'CASE_FILE' } })
    }
  },
  component: CaseListPage,
})

/**
 * HALLAZGO: `getSearch2Url` (generado por Orval) serializa el parámetro
 * `pageable` con `.toString()`, que en un objeto produce "[object Object]"
 * -- Orval no aplana objetos anidados en query params por defecto, y
 * springdoc expone `Pageable` como un único schema en vez de como
 * page/size/sort planos. Se llama `customFetch` directo aquí, construyendo
 * la query a mano, mientras se decide el fix real (¿serializer propio en
 * orval.config.ts, o cambiar cómo springdoc documenta Pageable?).
 */
/**
 * HALLAZGO: con el `retry: 1` global (App.tsx) más React 19 StrictMode
 * (doble montaje en dev), un fetch fallido deja la query en
 * `fetchStatus: 'paused'` para siempre -- ni loading, ni error, ni data.
 * `networkMode: 'always'` NO lo evita (el bug está en el reintento
 * agendado, no en la detección online/offline). `retry: false` aquí es
 * además la decisión correcta: un fallo de red/CORS por sesión Keycloak
 * ausente es determinista, no transitorio -- reintentar no ayuda.
 */
function useCaseFileSearch(page: number, size: number) {
  return useQuery({
    queryKey: ['case-files', 'search', page, size],
    queryFn: () =>
      customFetch<PageResponseCaseFileResponse>(`/api/v1/case-files?page=${page}&size=${size}`),
    staleTime: 30_000,
    networkMode: 'always',
    retry: false,
  })
}

const columns: ColumnDef<CaseFileResponse, unknown>[] = [
  {
    id: 'trackingNumber',
    accessorKey: 'trackingNumber',
    header: 'Radicado',
    cell: ({ getValue }) => {
      const value = getValue<string | undefined>()
      return value ? <TrackingNumberBadge value={value} /> : '—'
    },
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Estado',
    cell: ({ getValue }) => {
      const value = getValue<string | undefined>()
      return value ? <CaseStatusChip status={value} /> : '—'
    },
  },
  { id: 'crimeTypeCode', accessorKey: 'crimeTypeCode', header: 'Tipología', cell: ({ getValue }) => getValue<string>() ?? '—' },
  { id: 'municipalityCode', accessorKey: 'municipalityCode', header: 'Municipio', cell: ({ getValue }) => getValue<string>() ?? '—' },
]

function CaseListPage() {
  const { page, size } = Route.useSearch()
  const { data, isLoading, isError, error } = useCaseFileSearch(page, size)

  return (
    <div>
      <h1 className="text-lg font-semibold text-text-primary">Casos</h1>

      {isLoading && <p className="mt-4 text-sm text-text-secondary">Cargando…</p>}

      {isError && (
        <p className="mt-4 text-sm text-critical">
          {error instanceof Error ? error.message : 'No se pudo cargar la bandeja de casos.'}
        </p>
      )}

      {data && data.content && data.content.length === 0 && (
        <EmptyState
          title="No hay casos con estos filtros"
          description="Ajuste los filtros de búsqueda o cree un caso nuevo."
        />
      )}

      {data && data.content && data.content.length > 0 && (
        <div className="mt-4 h-[600px]">
          <DataTable data={data.content} columns={columns} getRowId={(row) => row.id ?? row.trackingNumber ?? ''} />
        </div>
      )}
    </div>
  )
}
