import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'
import { customFetch } from '@/api/client'
import type { EmailIngestionResponse } from '@/api/generated/models'
import { EmptyState } from '@/design-system/patterns/EmptyState'
import { DataTable } from '@/design-system/primitives/DataTable'
import { formatDateTime } from '@/lib/format/formatDateTime'

const STATUSES = ['PENDING', 'PARSED', 'NEEDS_REVIEW', 'FAILED', 'DISCARDED'] as const

const reviewQueueSearchSchema = z.object({
  page: z.number().catch(0),
  size: z.number().catch(20),
  status: z.enum(STATUSES).optional().catch(undefined),
})

type ReviewQueueSearch = z.infer<typeof reviewQueueSearchSchema>

export const Route = createFileRoute('/reportes/revision/')({
  validateSearch: reviewQueueSearchSchema,
  beforeLoad: ({ context }) => {
    if (!context.can('CREATE', 'OPERATIONAL_REPORT')) {
      throw redirect({ to: '/', search: { denied: 'OPERATIONAL_REPORT' } })
    }
  },
  component: ReviewQueuePage,
})

interface PageResponseEmailIngestion {
  content?: EmailIngestionResponse[]
}

function useReviewQueue(search: ReviewQueueSearch) {
  return useQuery({
    queryKey: ['reporting', 'review-queue', search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(search.page), size: String(search.size) })
      if (search.status) params.set('status', search.status)
      return customFetch<PageResponseEmailIngestion>(`/api/v1/review-queue?${params.toString()}`)
    },
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  PARSED: 'Auto-procesado',
  NEEDS_REVIEW: 'Necesita revisión',
  FAILED: 'Fallido',
  DISCARDED: 'Descartado',
}

const columns: ColumnDef<EmailIngestionResponse, unknown>[] = [
  {
    id: 'receivedAt',
    accessorKey: 'receivedAt',
    header: 'Recibido',
    cell: ({ row }) =>
      row.original.id ? (
        <Link to="/reportes/revision/$emailIngestionId" params={{ emailIngestionId: row.original.id }} className="hover:underline">
          {formatDateTime(row.original.receivedAt)}
        </Link>
      ) : (
        formatDateTime(row.original.receivedAt)
      ),
  },
  { id: 'sender', accessorKey: 'sender', header: 'Remitente', cell: ({ getValue }) => getValue<string>() ?? '—' },
  { id: 'subject', accessorKey: 'subject', header: 'Asunto', cell: ({ getValue }) => getValue<string>() ?? '—' },
  { id: 'status', accessorKey: 'status', header: 'Estado', cell: ({ getValue }) => STATUS_LABEL[getValue<string>() ?? ''] ?? '—' },
  { id: 'attempts', accessorKey: 'attempts', header: 'Intentos', cell: ({ getValue }) => getValue<number>() ?? 0 },
]

/** S7.FE.01: el correo es la red de seguridad, no el plan -- esta bandeja es secundaria a la captura manual/Excel. */
function ReviewQueuePage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data, isLoading, isError, error } = useReviewQueue(search)

  return (
    <div className="flex h-full flex-col">
      <h1 className="text-lg font-semibold text-text-primary">Cola de revisión de correo</h1>

      <div className="mt-4 flex items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Estado
          <select
            value={search.status ?? ''}
            onChange={(event) => void navigate({ search: (prev) => ({ ...prev, status: (event.target.value || undefined) as ReviewQueueSearch['status'], page: 0 }) })}
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
      </div>

      {isLoading && <p className="mt-4 text-sm text-text-secondary">Cargando…</p>}
      {isError && <p className="mt-4 text-sm text-critical">{error instanceof Error ? error.message : 'No se pudo cargar la cola.'}</p>}
      {data?.content && data.content.length === 0 && (
        <EmptyState title="No hay correos con este filtro" description="La cola de revisión está vacía para el estado seleccionado." />
      )}
      {data?.content && data.content.length > 0 && (
        <div className="mt-4 h-[600px]">
          <DataTable data={data.content} columns={columns} getRowId={(row) => row.id ?? ''} />
        </div>
      )}
    </div>
  )
}
