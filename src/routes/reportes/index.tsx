import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'
import { customFetch } from '@/api/client'
import type { OperationalReportResponse } from '@/api/generated/models'
import { useSessionQuery } from '@/lib/auth/useSession'
import { EmptyState } from '@/design-system/patterns/EmptyState'
import { DataTable } from '@/design-system/primitives/DataTable'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import { formatDateTime } from '@/lib/format/formatDateTime'

const STATUSES = ['DRAFT', 'UNDER_REVIEW', 'VALIDATED', 'REJECTED'] as const
const SOURCES = ['FORM', 'EMAIL', 'SICOE'] as const

const reportSearchSchema = z.object({
  page: z.number().catch(0),
  size: z.number().catch(20),
  status: z.enum(STATUSES).optional().catch(undefined),
  operationalUnitId: z.string().optional().catch(undefined),
  incidentDateFrom: z.string().optional().catch(undefined),
  incidentDateTo: z.string().optional().catch(undefined),
  source: z.enum(SOURCES).optional().catch(undefined),
})

type ReportSearch = z.infer<typeof reportSearchSchema>

export const Route = createFileRoute('/reportes/')({
  validateSearch: reportSearchSchema,
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'OPERATIONAL_REPORT')) {
      throw redirect({ to: '/', search: { denied: 'OPERATIONAL_REPORT' } })
    }
  },
  component: ReportsInboxPage,
})

interface PageResponseOperationalReportResponse {
  content?: OperationalReportResponse[]
}

function useReportSearch(search: ReportSearch) {
  return useQuery({
    queryKey: ['reporting', 'reports', 'search', search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(search.page), size: String(search.size) })
      if (search.status) params.set('status', search.status)
      if (search.operationalUnitId) params.set('operationalUnitId', search.operationalUnitId)
      if (search.incidentDateFrom) params.set('incidentDateFrom', search.incidentDateFrom)
      if (search.incidentDateTo) params.set('incidentDateTo', search.incidentDateTo)
      if (search.source) params.set('source', search.source)
      return customFetch<PageResponseOperationalReportResponse>(`/api/v1/operational-reports?${params.toString()}`)
    },
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  UNDER_REVIEW: 'En revisión',
  VALIDATED: 'Validado',
  REJECTED: 'Rechazado',
}

const columns: ColumnDef<OperationalReportResponse, unknown>[] = [
  {
    id: 'incidentDate',
    accessorKey: 'incidentDate',
    header: 'Fecha del incidente',
    cell: ({ row }) =>
      row.original.id ? (
        <Link to="/reportes/$reportId" params={{ reportId: row.original.id }} className="hover:underline">
          {row.original.incidentDate ?? '—'}
        </Link>
      ) : (
        row.original.incidentDate ?? '—'
      ),
  },
  { id: 'status', accessorKey: 'status', header: 'Estado', cell: ({ getValue }) => STATUS_LABEL[getValue<string>() ?? ''] ?? '—' },
  { id: 'source', accessorKey: 'source', header: 'Origen', cell: ({ getValue }) => getValue<string>() ?? '—' },
  { id: 'municipalityCode', accessorKey: 'municipalityCode', header: 'Municipio', cell: ({ getValue }) => getValue<string>() ?? '—' },
  { id: 'operationType', accessorKey: 'operationType', header: 'Tipo de operación', cell: ({ getValue }) => getValue<string>() ?? '—' },
  // `submittedAt` se fija al CAPTURAR el borrador (OperationalReport.createDraft), no al enviarlo a revisión.
  { id: 'submittedAt', accessorKey: 'submittedAt', header: 'Capturado', cell: ({ getValue }) => (getValue<string>() ? formatDateTime(getValue<string>()) : '—') },
]

function ReportsInboxPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data, isLoading, isError, error } = useReportSearch(search)
  const [showImport, setShowImport] = useState(false)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Reportes operacionales</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md" onClick={() => setShowImport((value) => !value)}>
            Importar Excel
          </Button>
          <Button asChild variant="primary" size="md">
            <Link to="/reportes/nuevo">Nuevo reporte</Link>
          </Button>
        </div>
      </div>

      {showImport && <ImportExcelPanel onClose={() => setShowImport(false)} />}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Estado
          <select
            value={search.status ?? ''}
            onChange={(event) => void navigate({ search: (prev) => ({ ...prev, status: (event.target.value || undefined) as ReportSearch['status'], page: 0 }) })}
            className="h-[var(--control-height-sm)] rounded-sm border border-border-strong bg-surface px-2 text-xs text-text-primary"
          >
            <option value="">Todos</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Origen
          <select
            value={search.source ?? ''}
            onChange={(event) => void navigate({ search: (prev) => ({ ...prev, source: (event.target.value || undefined) as ReportSearch['source'], page: 0 }) })}
            className="h-[var(--control-height-sm)] rounded-sm border border-border-strong bg-surface px-2 text-xs text-text-primary"
          >
            <option value="">Todos</option>
            {SOURCES.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Unidad operacional (id)
          <Input
            size="sm"
            value={search.operationalUnitId ?? ''}
            onChange={(event) => void navigate({ search: (prev) => ({ ...prev, operationalUnitId: event.target.value || undefined, page: 0 }) })}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Desde
          <Input
            size="sm"
            type="date"
            value={search.incidentDateFrom ?? ''}
            onChange={(event) => void navigate({ search: (prev) => ({ ...prev, incidentDateFrom: event.target.value || undefined, page: 0 }) })}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Hasta
          <Input
            size="sm"
            type="date"
            value={search.incidentDateTo ?? ''}
            onChange={(event) => void navigate({ search: (prev) => ({ ...prev, incidentDateTo: event.target.value || undefined, page: 0 }) })}
          />
        </label>
      </div>

      {isLoading && <p className="mt-4 text-sm text-text-secondary">Cargando…</p>}
      {isError && <p className="mt-4 text-sm text-critical">{error instanceof Error ? error.message : 'No se pudo cargar la bandeja.'}</p>}
      {data?.content && data.content.length === 0 && (
        <EmptyState title="No hay reportes con estos filtros" description="Ajuste los filtros o capture un nuevo reporte." />
      )}
      {data?.content && data.content.length > 0 && (
        <div className="mt-4 h-[600px]">
          <DataTable data={data.content} columns={columns} getRowId={(row) => row.id ?? ''} />
        </div>
      )}
    </div>
  )
}

interface ImportJobStatus {
  jobId?: string
  status?: 'PROCESSING' | 'DONE' | 'FAILED'
  totalRows?: number
  created?: number
  failures?: { rowNumber?: number; reason?: string }[]
  errorMessage?: string
}

/** S6.FE.06: sube el Excel, encola el trabajo (202) y sondea su estado hasta DONE/FAILED. */
function ImportExcelPanel({ onClose }: { onClose: () => void }) {
  const session = useSessionQuery()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [job, setJob] = useState<ImportJobStatus | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  async function pollStatus(jobId: string) {
    try {
      const status = await customFetch<ImportJobStatus>(`/api/v1/operational-reports/import/${jobId}`)
      setJob(status)
      if (status.status === 'DONE' || status.status === 'FAILED') {
        stopPolling()
        if (status.status === 'DONE') {
          await queryClient.invalidateQueries({ queryKey: ['reporting', 'reports', 'search'] })
        }
      }
    } catch {
      stopPolling()
      setUploadError('Se perdió el seguimiento del trabajo de importación.')
    }
  }

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0]
    if (!file || !session.data?.operationalUnitId) return
    setUploading(true)
    setUploadError(null)
    setJob(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const params = new URLSearchParams({
        territorialUnitId: session.data.territorialUnitId,
        operationalUnitId: session.data.operationalUnitId,
      })
      const accepted = await customFetch<{ jobId: string }>(`/api/v1/operational-reports/import?${params.toString()}`, {
        method: 'POST',
        body: formData,
      })
      setJob({ jobId: accepted.jobId, status: 'PROCESSING' })
      pollRef.current = setInterval(() => void pollStatus(accepted.jobId), 1500)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'No se pudo iniciar la importación.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mt-4 rounded-sm border border-border-strong bg-surface-raised p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Importar reportes desde Excel</h2>
        <button type="button" onClick={onClose} className="text-2xs text-text-muted hover:text-text-primary">
          Cerrar
        </button>
      </div>

      <p className="mt-1 text-2xs text-text-muted">
        SPEC-0401 CA-7: cada fila se valida y se guarda de forma independiente -- una fila inválida no impide que las demás se importen.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <input ref={fileInputRef} type="file" accept=".xlsx" className="text-sm text-text-primary" />
        <Button variant="primary" size="sm" loading={uploading} onClick={handleUpload}>
          Subir
        </Button>
      </div>

      {uploadError && <p className="mt-2 text-sm text-critical">{uploadError}</p>}

      {job?.status === 'PROCESSING' && (
        <p className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden /> Procesando el archivo…
        </p>
      )}

      {job?.status === 'FAILED' && <p className="mt-2 text-sm text-critical">Fallo la importación: {job.errorMessage}</p>}

      {job?.status === 'DONE' && (
        <div className="mt-2 text-sm text-text-primary">
          <p>
            {job.created} de {job.totalRows} filas se importaron correctamente.
          </p>
          {(job.failures?.length ?? 0) > 0 && (
            <div className="mt-1">
              <p className="text-2xs font-semibold uppercase text-alert">Filas rechazadas</p>
              <ul className="list-inside list-disc text-2xs text-text-secondary">
                {job.failures?.map((failure) => (
                  <li key={failure.rowNumber}>
                    Fila {failure.rowNumber}: {failure.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
