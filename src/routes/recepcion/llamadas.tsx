import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'
import { customFetch } from '@/api/client'
import type { CallResponse } from '@/api/generated/models'
import { EmptyState } from '@/design-system/patterns/EmptyState'
import { DataTable } from '@/design-system/primitives/DataTable'
import { Button } from '@/design-system/primitives/Button'
import { formatDateTime } from '@/lib/format/formatDateTime'

const CALL_STATUSES = ['IN_PROGRESS', 'CLOSED_AS_CASE', 'CLOSED_AS_REFERRAL', 'CLOSED_NO_ACTION'] as const
const JURISDICTIONS = ['UNDETERMINED', 'GAULA', 'REFERRED'] as const

const callSearchSchema = z.object({
  page: z.number().catch(0),
  size: z.number().catch(20),
  status: z.enum(CALL_STATUSES).optional().catch(undefined),
  jurisdiction: z.enum(JURISDICTIONS).optional().catch(undefined),
})

type CallSearch = z.infer<typeof callSearchSchema>

export const Route = createFileRoute('/recepcion/llamadas')({
  validateSearch: callSearchSchema,
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'CALL')) {
      throw redirect({ to: '/', search: { denied: 'CALL' } })
    }
  },
  component: CallsInboxPage,
})

interface PageResponseCallResponse {
  content?: CallResponse[]
}

function useCallSearch(search: CallSearch) {
  return useQuery({
    queryKey: ['calls', 'search', search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(search.page), size: String(search.size) })
      if (search.status) params.set('status', search.status)
      if (search.jurisdiction) params.set('jurisdiction', search.jurisdiction)
      return customFetch<PageResponseCallResponse>(`/api/v1/calls?${params.toString()}`)
    },
    staleTime: 15_000,
    networkMode: 'always',
    retry: false,
  })
}

const STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: 'En curso',
  CLOSED_AS_CASE: 'Caso creado',
  CLOSED_AS_REFERRAL: 'Derivada',
  CLOSED_NO_ACTION: 'Sin acción',
}

const JURISDICTION_LABEL: Record<string, string> = {
  UNDETERMINED: 'Sin determinar',
  GAULA: 'GAULA',
  REFERRED: 'Derivada',
}

/** S5.FE.01: la tarjeta de derivación exportable (S5.ADI.02) -- sólo aplica a llamadas derivadas. */
function ExportReferralPdfButton({ callId }: { callId: string }) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    setError(null)
    try {
      const blob = await customFetch<Blob>(`/api/v1/calls/${callId}/referral/export.pdf`)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `derivacion-${callId}.pdf`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo exportar la tarjeta de derivación.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        className="text-2xs font-medium text-accent hover:text-accent-hover disabled:opacity-50"
      >
        {exporting ? 'Exportando…' : 'Exportar PDF'}
      </button>
      {error && <p className="text-2xs text-critical">{error}</p>}
    </div>
  )
}

const columns: ColumnDef<CallResponse, unknown>[] = [
  { id: 'sequenceNumber', accessorKey: 'sequenceNumber', header: '#', cell: ({ getValue }) => getValue<number>() ?? '—' },
  { id: 'startedAt', accessorKey: 'startedAt', header: 'Inicio', cell: ({ getValue }) => formatDateTime(getValue<string>()) },
  { id: 'status', accessorKey: 'status', header: 'Estado', cell: ({ getValue }) => STATUS_LABEL[getValue<string>() ?? ''] ?? '—' },
  { id: 'crimeTypeCode', accessorKey: 'crimeTypeCode', header: 'Tipología', cell: ({ getValue }) => getValue<string>() ?? '—' },
  { id: 'municipalityCode', accessorKey: 'municipalityCode', header: 'Municipio', cell: ({ getValue }) => getValue<string>() ?? '—' },
  { id: 'jurisdiction', accessorKey: 'jurisdiction', header: 'Competencia', cell: ({ getValue }) => JURISDICTION_LABEL[getValue<string>() ?? ''] ?? '—' },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) =>
      row.original.status === 'CLOSED_AS_REFERRAL' && row.original.id ? <ExportReferralPdfButton callId={row.original.id} /> : null,
  },
]

function CallsInboxPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data, isLoading, isError, error } = useCallSearch(search)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Llamadas</h1>
        <Button asChild variant="primary" size="md">
          <Link to="/recepcion">Nueva llamada</Link>
        </Button>
      </div>

      <div className="mt-4 flex items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Estado
          <select
            value={search.status ?? ''}
            onChange={(event) =>
              void navigate({ search: (prev) => ({ ...prev, status: (event.target.value || undefined) as CallSearch['status'], page: 0 }) })
            }
            className="h-[var(--control-height-sm)] rounded-sm border border-border-strong bg-surface px-2 text-xs text-text-primary"
          >
            <option value="">Todos</option>
            {CALL_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Competencia
          <select
            value={search.jurisdiction ?? ''}
            onChange={(event) =>
              void navigate({
                search: (prev) => ({ ...prev, jurisdiction: (event.target.value || undefined) as CallSearch['jurisdiction'], page: 0 }),
              })
            }
            className="h-[var(--control-height-sm)] rounded-sm border border-border-strong bg-surface px-2 text-xs text-text-primary"
          >
            <option value="">Todas</option>
            {JURISDICTIONS.map((jurisdiction) => (
              <option key={jurisdiction} value={jurisdiction}>
                {JURISDICTION_LABEL[jurisdiction]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && <p className="mt-4 text-sm text-text-secondary">Cargando…</p>}
      {isError && <p className="mt-4 text-sm text-critical">{error instanceof Error ? error.message : 'No se pudo cargar la bandeja.'}</p>}
      {data?.content && data.content.length === 0 && (
        <EmptyState title="No hay llamadas con estos filtros" description="Ajuste los filtros o registre una nueva llamada." />
      )}
      {data?.content && data.content.length > 0 && (
        <div className="mt-4 h-[600px]">
          <DataTable data={data.content} columns={columns} getRowId={(row) => row.id ?? ''} />
        </div>
      )}
    </div>
  )
}
