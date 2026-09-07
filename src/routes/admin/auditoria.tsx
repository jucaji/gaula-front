import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'
import { customFetch } from '@/api/client'
import type { AuditEntryResponse, PageResponseAuditEntryResponse } from '@/api/generated/models'
import { AdminNav } from '@/design-system/patterns/AdminNav'
import { DataTable } from '@/design-system/primitives/DataTable'
import { Badge } from '@/design-system/primitives/Badge'
import { Input } from '@/design-system/primitives/Input'

const auditSearchSchema = z.object({
  actorId: z.string().optional(),
  resourceType: z.string().optional(),
  outcome: z.string().optional(),
})

export const Route = createFileRoute('/admin/auditoria')({
  validateSearch: auditSearchSchema,
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'ADMIN')) {
      throw redirect({ to: '/', search: { denied: 'ADMIN' } })
    }
  },
  component: AdminAuditPage,
})

function useAuditSearch(actorId: string, resourceType: string, outcome: string) {
  return useQuery({
    queryKey: ['admin', 'audit', 'search', actorId, resourceType, outcome],
    queryFn: () => {
      const params = new URLSearchParams({ page: '0', size: '50' })
      if (actorId) params.set('actorId', actorId)
      if (resourceType) params.set('resourceType', resourceType)
      if (outcome) params.set('outcome', outcome)
      return customFetch<PageResponseAuditEntryResponse>(`/api/v1/admin/audit?${params.toString()}`)
    },
    staleTime: 5_000,
    networkMode: 'always',
    retry: false,
  })
}

const OUTCOME_TONE: Record<string, 'stable' | 'critical' | 'alert'> = {
  ALLOWED: 'stable',
  DENIED: 'critical',
  ERROR: 'alert',
}

const columns: ColumnDef<AuditEntryResponse, unknown>[] = [
  { id: 'occurredAt', accessorKey: 'occurredAt', header: 'Cuándo', cell: ({ getValue }) => new Date(getValue<string>()).toLocaleString('es-CO') },
  { id: 'actorUsername', accessorKey: 'actorUsername', header: 'Actor', cell: ({ getValue }) => getValue<string>() ?? '—' },
  { id: 'action', accessorKey: 'action', header: 'Acción' },
  { id: 'resourceType', accessorKey: 'resourceType', header: 'Recurso' },
  { id: 'resourceId', accessorKey: 'resourceId', header: 'ID del recurso', cell: ({ getValue }) => getValue<string>() ?? '—' },
  {
    id: 'outcome',
    accessorKey: 'outcome',
    header: 'Resultado',
    cell: ({ getValue }) => {
      const outcome = getValue<string>()
      return <Badge tone={OUTCOME_TONE[outcome] ?? 'neutral'}>{outcome}</Badge>
    },
  },
]

function AdminAuditPage() {
  const search = Route.useSearch()
  const [actorId, setActorId] = useState(search.actorId ?? '')
  const [resourceType, setResourceType] = useState(search.resourceType ?? '')
  const [outcome, setOutcome] = useState(search.outcome ?? '')
  const { data, isLoading, isError, error } = useAuditSearch(actorId, resourceType, outcome)

  return (
    <div className="flex h-full flex-col">
      <AdminNav />
      <h1 className="text-lg font-semibold text-text-primary">Auditoría</h1>
      <p className="mt-1 text-sm text-text-secondary">Consultar esta pantalla también queda registrado.</p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Actor (UUID)
          <Input size="sm" value={actorId} onChange={(event) => setActorId(event.target.value)} className="w-64" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Recurso
          <Input
            size="sm"
            value={resourceType}
            onChange={(event) => setResourceType(event.target.value)}
            placeholder="CASE_FILE"
            className="w-40"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Resultado
          <select
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            className="h-[var(--control-height-sm)] rounded-sm border border-border-strong bg-surface px-2 text-xs text-text-primary"
          >
            <option value="">Todos</option>
            <option value="ALLOWED">ALLOWED</option>
            <option value="DENIED">DENIED</option>
            <option value="ERROR">ERROR</option>
          </select>
        </label>
      </div>

      {isLoading && <p className="mt-4 text-sm text-text-secondary">Cargando…</p>}
      {isError && (
        <p className="mt-4 text-sm text-critical">
          {error instanceof Error ? error.message : 'No se pudo cargar la auditoría.'}
        </p>
      )}

      {data && data.content && (
        <div className="mt-4 h-[600px]">
          <DataTable data={data.content} columns={columns} getRowId={(entry) => String(entry.id)} />
        </div>
      )}
    </div>
  )
}
