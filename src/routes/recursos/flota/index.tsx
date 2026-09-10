import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'
import { customFetch } from '@/api/client'
import type { FleetAssignmentResponse, VehicleResponse } from '@/api/generated/models'
import { FleetNav } from '@/design-system/patterns/FleetNav'
import { EmptyState } from '@/design-system/patterns/EmptyState'
import { DataTable } from '@/design-system/primitives/DataTable'
import { Input } from '@/design-system/primitives/Input'

const VEHICLE_STATUSES = ['AVAILABLE', 'IN_MISSION', 'MAINTENANCE', 'OUT_OF_SERVICE'] as const

const fleetSearchSchema = z.object({
  page: z.number().catch(0),
  size: z.number().catch(20),
  status: z.enum(VEHICLE_STATUSES).optional().catch(undefined),
  territorialUnitId: z.string().optional().catch(undefined),
})

type FleetSearch = z.infer<typeof fleetSearchSchema>

export const Route = createFileRoute('/recursos/flota/')({
  validateSearch: fleetSearchSchema,
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'FLEET')) {
      throw redirect({ to: '/', search: { denied: 'FLEET' } })
    }
  },
  component: FleetPage,
})

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'Disponible',
  IN_MISSION: 'En misión',
  MAINTENANCE: 'En mantenimiento',
  OUT_OF_SERVICE: 'Fuera de servicio',
}

interface PageResponseVehicle {
  content?: VehicleResponse[]
}

interface PageResponseFleetAssignment {
  content?: FleetAssignmentResponse[]
}

function useVehicles(search: FleetSearch) {
  return useQuery({
    queryKey: ['resource', 'vehicles', search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(search.page), size: String(search.size) })
      if (search.status) params.set('status', search.status)
      if (search.territorialUnitId) params.set('territorialUnitId', search.territorialUnitId)
      return customFetch<PageResponseVehicle>(`/api/v1/vehicles?${params.toString()}`)
    },
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

function useAssignments() {
  return useQuery({
    queryKey: ['resource', 'vehicle-assignments'],
    queryFn: () => customFetch<PageResponseFleetAssignment>('/api/v1/vehicles/assignments?page=0&size=50'),
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

const columns: ColumnDef<VehicleResponse, unknown>[] = [
  {
    id: 'plate',
    accessorKey: 'plate',
    header: 'Placa',
    cell: ({ row }) =>
      row.original.id ? (
        <Link to="/recursos/flota/$vehicleId" params={{ vehicleId: row.original.id }} className="hover:underline">
          {row.original.plate}
        </Link>
      ) : (
        row.original.plate ?? '—'
      ),
  },
  { id: 'vehicleType', accessorKey: 'vehicleType', header: 'Tipo', cell: ({ getValue }) => getValue<string>() ?? '—' },
  {
    id: 'model',
    header: 'Marca / modelo',
    cell: ({ row }) => [row.original.make, row.original.model, row.original.modelYear].filter(Boolean).join(' ') || '—',
  },
  { id: 'status', accessorKey: 'status', header: 'Estado', cell: ({ getValue }) => STATUS_LABEL[getValue<string>() ?? ''] ?? '—' },
  { id: 'odometerKm', accessorKey: 'odometerKm', header: 'Odómetro (km)', cell: ({ getValue }) => (getValue<number>() ?? 0).toLocaleString('es-CO') },
]

const assignmentColumns: ColumnDef<FleetAssignmentResponse, unknown>[] = [
  { id: 'plate', accessorKey: 'plate', header: 'Placa', cell: ({ getValue }) => getValue<string>() ?? '—' },
  { id: 'vehicleStatus', accessorKey: 'vehicleStatus', header: 'Estado', cell: ({ getValue }) => STATUS_LABEL[getValue<string>() ?? ''] ?? '—' },
  // S8.APP.02: sólo radicado y estado -- nunca el expediente.
  { id: 'caseFileTrackingNumber', accessorKey: 'caseFileTrackingNumber', header: 'Caso (radicado)', cell: ({ getValue }) => getValue<string>() ?? '—' },
  { id: 'assignedFrom', accessorKey: 'assignedFrom', header: 'Desde', cell: ({ getValue }) => (getValue<string>() ? new Date(getValue<string>()).toLocaleString('es-CO') : '—') },
]

function FleetPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const vehicles = useVehicles(search)
  const assignments = useAssignments()

  return (
    <div className="flex h-full flex-col gap-6">
      <div>
        <FleetNav />
        <h1 className="text-lg font-semibold text-text-primary">Flota</h1>

        <div className="mt-4 flex items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Estado
            <select
              value={search.status ?? ''}
              onChange={(event) => void navigate({ search: (prev) => ({ ...prev, status: (event.target.value || undefined) as FleetSearch['status'], page: 0 }) })}
              className="h-[var(--control-height-sm)] rounded-sm border border-border-strong bg-surface px-2 text-xs text-text-primary"
            >
              <option value="">Todos</option>
              {VEHICLE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Unidad territorial (id)
            <Input
              size="sm"
              value={search.territorialUnitId ?? ''}
              onChange={(event) => void navigate({ search: (prev) => ({ ...prev, territorialUnitId: event.target.value || undefined, page: 0 }) })}
            />
          </label>
        </div>

        {vehicles.isLoading && <p className="mt-4 text-sm text-text-secondary">Cargando…</p>}
        {vehicles.isError && <p className="mt-4 text-sm text-critical">No se pudo cargar la flota.</p>}
        {vehicles.data?.content && vehicles.data.content.length === 0 && (
          <EmptyState title="No hay vehículos con este filtro" description="Ajuste los filtros para ver la flota disponible." />
        )}
        {vehicles.data?.content && vehicles.data.content.length > 0 && (
          <div className="mt-4 h-[400px]">
            <DataTable data={vehicles.data.content} columns={columns} getRowId={(row) => row.id ?? ''} />
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-text-primary">Asignaciones activas</h2>
        {assignments.data?.content && assignments.data.content.length === 0 && (
          <p className="mt-2 text-sm text-text-secondary">Ningún vehículo tiene una asignación activa.</p>
        )}
        {assignments.data?.content && assignments.data.content.length > 0 && (
          <div className="mt-2 h-[300px]">
            <DataTable data={assignments.data.content} columns={assignmentColumns} getRowId={(row) => row.vehicleId ?? ''} />
          </div>
        )}
      </div>
    </div>
  )
}
