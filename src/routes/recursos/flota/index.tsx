import { useState } from 'react'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { z } from 'zod'
import type { ColumnDef } from '@tanstack/react-table'
import { customFetch } from '@/api/client'
import type { FleetAssignmentResponse, VehicleResponse } from '@/api/generated/models'
import { FleetNav } from '@/design-system/patterns/FleetNav'
import { EmptyState } from '@/design-system/patterns/EmptyState'
import { DataTable } from '@/design-system/primitives/DataTable'
import { Button } from '@/design-system/primitives/Button'
import { VehicleForm } from '@/design-system/domain/VehicleForm'
import { MissionTypesDialog } from '@/design-system/domain/MissionTypesDialog'
import { Badge } from '@/design-system/primitives/Badge'
import { useDevices, useFleetMutations, useTerritorialUnits } from '@/lib/fleet/useFleetAdmin'
import { ATTENTION_LABEL, EMPTY_VEHICLE_FORM, isVehicleFormComplete, type TerritorialUnit, type VehicleFormValues } from '@/lib/fleet/types'

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

/**
 * SPEC-0508 CA-9/CA-10: las columnas dejan de esconder lo que importa.
 *
 * <p>Se construyen dentro del componente porque dos de ellas dependen de datos
 * que se consultan aparte: el NOMBRE de la unidad territorial (antes se mostraba
 * el UUID) y si el vehículo tiene GPS inscrito — la columna que responde «¿por
 * qué éste no sale en el mapa?» sin ir a preguntarlo a otra pantalla.
 */
function buildColumns(
  units: TerritorialUnit[],
  vehicleIdsWithDevice: Set<string> | null,
): ColumnDef<VehicleResponse, unknown>[] {
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
    {
      id: 'territorialUnit',
      header: 'Unidad',
      cell: ({ row }) => {
        const unit = units.find((candidate) => candidate.id === row.original.territorialUnitId)
        return unit ? unit.name : '—'
      },
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: 'Estado',
      // SPEC-0509: el inventario avisa cuando una misión o un mantenimiento
      // pasó de su fecha estimada, en vez de que el usuario tenga que preguntar.
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-1">
          {STATUS_LABEL[row.original.status ?? ''] ?? '—'}
          {(row.original as { attention?: string | null }).attention && (
            <Badge tone="critical">
              {ATTENTION_LABEL[(row.original as { attention?: string | null }).attention ?? ''] ?? 'Requiere atención'}
            </Badge>
          )}
        </span>
      ),
    },
    { id: 'odometerKm', accessorKey: 'odometerKm', header: 'Odómetro (km)', cell: ({ getValue }) => (getValue<number>() ?? 0).toLocaleString('es-CO') },
  ]

  // Sólo para quien administra equipos: para los demás la columna diría
  // siempre lo mismo, porque el backend no les entrega el inventario de GPS.
  if (vehicleIdsWithDevice !== null) {
    columns.push({
      id: 'gps',
      header: 'GPS',
      cell: ({ row }) => (row.original.id && vehicleIdsWithDevice.has(row.original.id) ? 'Inscrito' : 'Sin equipo'),
    })
  }

  columns.push({
    id: 'ficha',
    header: '',
    cell: ({ row }) =>
      row.original.id ? (
        // La placa ya era enlace, pero nada lo indicaba: el cliente contó que
        // llegó a la ficha «adivinando».
        <Link
          to="/recursos/flota/$vehicleId"
          params={{ vehicleId: row.original.id }}
          className="text-accent-hover underline"
        >
          Ver ficha
        </Link>
      ) : null,
  })

  return columns
}

const assignmentColumns: ColumnDef<FleetAssignmentResponse, unknown>[] = [
  { id: 'plate', accessorKey: 'plate', header: 'Placa', cell: ({ getValue }) => getValue<string>() ?? '—' },
  { id: 'vehicleStatus', accessorKey: 'vehicleStatus', header: 'Estado', cell: ({ getValue }) => STATUS_LABEL[getValue<string>() ?? ''] ?? '—' },
  // S8.APP.02: sólo radicado y estado -- nunca el expediente.
  { id: 'caseFileTrackingNumber', accessorKey: 'caseFileTrackingNumber', header: 'Caso (radicado)', cell: ({ getValue }) => getValue<string>() ?? '—' },
  { id: 'assignedFrom', accessorKey: 'assignedFrom', header: 'Desde', cell: ({ getValue }) => (getValue<string>() ? new Date(getValue<string>()).toLocaleString('es-CO') : '—') },
]

/**
 * SPEC-0507 CA-13: el alta de un vehículo, dentro de la propia pantalla.
 *
 * <p>Un panel en línea y no un diálogo modal: registrar un vehículo se hace
 * mirando la lista —para no repetir una placa que ya está— y un modal la tapa.
 */
function RegisterVehiclePanel({ onDone }: { onDone: () => void }) {
  const [values, setValues] = useState<VehicleFormValues>(EMPTY_VEHICLE_FORM)
  const units = useTerritorialUnits()
  const { register } = useFleetMutations()

  async function submit() {
    await register.mutateAsync(values)
    setValues(EMPTY_VEHICLE_FORM)
    onDone()
  }

  return (
    <form
      className="mt-4 flex flex-col gap-3 rounded-sm border border-border-strong bg-surface-raised p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <h2 className="text-sm font-semibold text-text-primary">Registrar vehículo</h2>

      <VehicleForm values={values} onChange={setValues} units={units.data ?? []} mode="create"
                   disabled={register.isPending} />

      {units.isError && (
        <p className="text-sm text-critical">
          No se pudieron cargar las unidades territoriales; sin ellas no se puede registrar.
        </p>
      )}
      {register.isError && (
        <p className="text-sm text-critical">
          {register.error instanceof Error ? register.error.message : 'No se pudo registrar el vehículo.'}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" loading={register.isPending}
                disabled={!isVehicleFormComplete(values, 'create')}>
          Registrar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

function FleetPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const vehicles = useVehicles(search)
  const assignments = useAssignments()
  const { can } = Route.useRouteContext()
  const canCreate = can('CREATE', 'FLEET')
  const canSeeDevices = can('READ', 'TRACKING_DEVICE')
  const hasFilters = Boolean(search.status) || Boolean(search.territorialUnitId)
  const units = useTerritorialUnits()
  const devices = useDevices(canSeeDevices)

  const vehicleIdsWithDevice = canSeeDevices && devices.data
    ? new Set((devices.data.content ?? []).map((device) => device.vehicleId).filter((id): id is string => Boolean(id)))
    : null
  const columns = buildColumns(units.data ?? [], vehicleIdsWithDevice)
  const [registering, setRegistering] = useState(false)

  return (
    <div className="flex h-full flex-col gap-6">
      <div>
        <FleetNav />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-text-primary">Flota</h1>
          {canCreate && !registering && (
            <div className="flex items-center gap-2">
              <MissionTypesDialog />
            <Button variant="primary" size="sm" onClick={() => setRegistering(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Registrar vehículo
            </Button>
            </div>
          )}
        </div>

        {registering && <RegisterVehiclePanel onDone={() => setRegistering(false)} />}

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
            Unidad territorial
            {/* Se elige de una lista, no se teclea: un UUID en un campo de texto
                no es un filtro, es una adivinanza (SPEC-0508 CA-9). */}
            <select
              value={search.territorialUnitId ?? ''}
              onChange={(event) => void navigate({ search: (prev) => ({ ...prev, territorialUnitId: event.target.value || undefined, page: 0 }) })}
              className="h-[var(--control-height-sm)] rounded-sm border border-border-strong bg-surface px-2 text-xs text-text-primary"
            >
              <option value="">Todas</option>
              {(units.data ?? []).map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {vehicles.isLoading && <p className="mt-4 text-sm text-text-secondary">Cargando…</p>}
        {vehicles.isError && <p className="mt-4 text-sm text-critical">No se pudo cargar la flota.</p>}
        {vehicles.data?.content && vehicles.data.content.length === 0 && (
          // docs/06 §8.8: un vacío tiene que explicarse, y no puede inventarse
          // la causa. Con filtro puestos, la causa probable es el filtro y se
          // ofrece quitarlo. SIN filtros, decir «ajuste los filtros» es falso y
          // manda a perder el tiempo: lo que hay es una lista acotada al
          // alcance de quien mira (docs/04 §4), y eso es lo que hay que decir.
          hasFilters ? (
            <EmptyState
              title="Ningún vehículo coincide con este filtro"
              description="Pruebe con otro estado o quite el filtro de unidad."
              action={
                <Button variant="secondary" size="sm"
                        onClick={() => void navigate({ search: () => ({ page: 0, size: search.size }) })}>
                  Quitar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="Aquí no aparece ningún vehículo"
              description="Esta lista muestra sólo los vehículos que su rol alcanza. O no hay ninguno registrado en su unidad, o su rol no alcanza la flota; un administrador puede revisarlo en Administración › Usuarios."
            />
          )
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
