import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'
import { customFetch } from '@/api/client'
import type { CaseFileResponse, PageResponseCaseFileResponse } from '@/api/generated/models'
import { TrackingNumberBadge } from '@/design-system/domain/TrackingNumberBadge'
import { CaseStatusChip } from '@/design-system/domain/CaseStatusChip'
import { PriorityIndicator } from '@/design-system/domain/PriorityIndicator'
import { EmptyState } from '@/design-system/patterns/EmptyState'
import { DataTable } from '@/design-system/primitives/DataTable'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'

const CASE_STATUSES = [
  'RECEIVED',
  'UNDER_VERIFICATION',
  'IN_OPERATION',
  'RESULT_RECORDED',
  'PROSECUTED',
  'CLOSED',
  'CLOSED_WITHOUT_MERIT',
] as const

// docs/07 §2: los filtros viven en la URL, tipados y validados con Zod.
const caseSearchSchema = z.object({
  page: z.number().catch(0),
  size: z.number().catch(20),
  status: z.enum(CASE_STATUSES).optional().catch(undefined),
  municipalityCode: z.string().optional().catch(undefined),
  crimeTypeCode: z.string().optional().catch(undefined),
})

type CaseSearch = z.infer<typeof caseSearchSchema>

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
 *
 * HALLAZGO: con el `retry: 1` global (App.tsx) más React 19 StrictMode
 * (doble montaje en dev), un fetch fallido deja la query en
 * `fetchStatus: 'paused'` para siempre -- ni loading, ni error, ni data.
 * `networkMode: 'always'` NO lo evita (el bug está en el reintento
 * agendado, no en la detección online/offline). `retry: false` aquí es
 * además la decisión correcta: un fallo de red/CORS por sesión Keycloak
 * ausente es determinista, no transitorio -- reintentar no ayuda.
 */
function useCaseFileSearch(search: CaseSearch) {
  return useQuery({
    queryKey: ['case-files', 'search', search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(search.page), size: String(search.size) })
      if (search.status) params.set('status', search.status)
      if (search.municipalityCode) params.set('municipalityCode', search.municipalityCode)
      if (search.crimeTypeCode) params.set('crimeTypeCode', search.crimeTypeCode)
      return customFetch<PageResponseCaseFileResponse>(`/api/v1/case-files?${params.toString()}`)
    },
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
      if (!value) return '—'
      return (
        <Link to="/casos/$trackingNumber" params={{ trackingNumber: value }} className="hover:underline">
          <TrackingNumberBadge value={value} />
        </Link>
      )
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
  {
    id: 'priority',
    accessorKey: 'priority',
    header: 'Prioridad',
    cell: ({ getValue }) => {
      const value = getValue<string | undefined>()
      return value ? <PriorityIndicator priority={value} /> : '—'
    },
  },
  { id: 'crimeTypeCode', accessorKey: 'crimeTypeCode', header: 'Tipología', cell: ({ getValue }) => getValue<string>() ?? '—' },
  { id: 'municipalityCode', accessorKey: 'municipalityCode', header: 'Municipio', cell: ({ getValue }) => getValue<string>() ?? '—' },
]

function CaseListPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data, isLoading, isError, error } = useCaseFileSearch(search)

  function updateFilter(patch: Partial<CaseSearch>) {
    void navigate({ search: (prev) => ({ ...prev, ...patch, page: 0 }) })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Casos</h1>
        <Button asChild variant="primary" size="md">
          <Link to="/casos/nuevo">Nuevo caso</Link>
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Estado
          <select
            value={search.status ?? ''}
            onChange={(event) => updateFilter({ status: (event.target.value || undefined) as CaseSearch['status'] })}
            className="h-[var(--control-height-sm)] rounded-sm border border-border-strong bg-surface px-2 text-xs text-text-primary"
          >
            <option value="">Todos</option>
            {CASE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Municipio (DIVIPOLA)
          <Input
            size="sm"
            defaultValue={search.municipalityCode ?? ''}
            onBlur={(event) => updateFilter({ municipalityCode: event.target.value || undefined })}
            className="w-40"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Tipología
          <Input
            size="sm"
            defaultValue={search.crimeTypeCode ?? ''}
            onBlur={(event) => updateFilter({ crimeTypeCode: event.target.value || undefined })}
            className="w-40"
          />
        </label>
      </div>

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
