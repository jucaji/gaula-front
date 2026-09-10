import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import { EmptyState } from '@/design-system/patterns/EmptyState'
import { FleetNav } from '@/design-system/patterns/FleetNav'
import { FleetSummary } from '@/design-system/domain/FleetSummary'
import { VehicleList } from '@/design-system/domain/VehicleList'
import { VehicleDetailsPanel } from '@/design-system/domain/VehicleDetailsPanel'
import { FleetMap } from '@/design-system/maps/FleetMap'
import { MOVEMENT_STYLE } from '@/design-system/maps/FleetMapPort'
import { useFleetPositions, FLEET_REFRESH_MS } from '@/lib/telemetry/useFleetPositions'
import { useVehicleTelemetry } from '@/lib/telemetry/useVehicleTelemetry'
import { formatAgeSeconds } from '@/lib/format/formatDateTime'
import type { MovementState } from '@/lib/telemetry/types'

const MOVEMENT_STATES = [
  'MOVING',
  'STOPPED',
  'NO_SIGNAL',
  'NEVER_REPORTED',
  'UNDETERMINED',
] as const

const searchSchema = z.object({
  estado: z.enum(MOVEMENT_STATES).optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  vehiculo: z.string().optional().catch(undefined),
  vivo: z.boolean().catch(true),
})

export const Route = createFileRoute('/flota/')({
  validateSearch: searchSchema,
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'VEHICLE_TELEMETRY')) {
      throw redirect({ to: '/', search: { denied: 'VEHICLE_TELEMETRY' } })
    }
  },
  component: FleetCommandPage,
})

/**
 * SPEC-0506 — Comando de flota.
 *
 * Ancho completo y sin `mx-auto` a propósito (docs/06 §8.6): esto es una
 * bandeja de operación, no un documento. El mapa manda, la lista identifica y
 * el detalle explica.
 */
function FleetCommandPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const fleet = useFleetPositions({ live: search.vivo })
  const selectedVehicleId = search.vehiculo ?? null
  const vehicle = useVehicleTelemetry(selectedVehicleId, search.vivo)
  const [now, setNow] = useState(() => Date.now())

  // La antigüedad de la consulta tiene que envejecer en pantalla aunque no
  // llegue un dato nuevo: si el backend deja de responder, "hace 4 s" congelado
  // diría que todo está bien justo cuando ha dejado de estarlo.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const positions = useMemo(() => {
    const all = fleet.data?.positions ?? []
    const term = search.q?.trim().toLowerCase()
    return all.filter((position) => {
      if (search.estado && position.state !== search.estado) return false
      if (term && !position.vehicleId.toLowerCase().includes(term)) return false
      return true
    })
  }, [fleet.data, search.estado, search.q])

  // La PLACA, que es como un operador nombra un vehículo por radio.
  //
  // Antes se recortaba el UUID a ocho caracteres, y con identificadores
  // consecutivos los seis vehículos se veían los seis como «00000000»:
  // indistinguibles, con el requisito de identificación sin cumplir. Se vio
  // mirando la consola, no en una prueba -- los datos mockeados del E2E tenían
  // UUID bien separados.
  const plateById = useMemo(() => {
    const map = new Map<string, string>()
    fleet.data?.positions.forEach((position) => {
      if (position.plate) map.set(position.vehicleId, position.plate)
    })
    return map
  }, [fleet.data])

  // Sin placa se muestra el identificador, no un guion: un vehículo que
  // `resource` ya no conoce sigue estando en el mapa y hay que poder señalarlo.
  const labelFor = (vehicleId: string) =>
    plateById.get(vehicleId) ?? `${vehicleId.slice(0, 8).toUpperCase()}…`

  const setSearch = (patch: Partial<typeof search>) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch }) })

  const consultedSecondsAgo = fleet.data
    ? Math.max(0, Math.round((now - new Date(fleet.data.observedAt).getTime()) / 1000))
    : null

  return (
    <div className="flex h-full flex-col gap-3">
      <FleetNav />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Comando de flota</h1>
          <p className="text-xs text-text-secondary">
            {fleet.data
              ? `Consulta ${formatAgeSeconds(consultedSecondsAgo)}`
              : 'Consultando la flota…'}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Buscar vehículo
            <Input
              size="sm"
              value={search.q ?? ''}
              placeholder="Identificador"
              onChange={(event) => setSearch({ q: event.target.value || undefined })}
            />
          </label>

          <label className="flex min-h-[var(--tap-min)] items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={search.vivo}
              onChange={(event) => setSearch({ vivo: event.target.checked })}
              className="size-4"
            />
            Seguimiento en vivo
            <span className="text-text-muted">(cada {FLEET_REFRESH_MS / 1000} s)</span>
          </label>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => void fleet.refetch()}
            loading={fleet.isFetching}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Actualizar
          </Button>
        </div>
      </header>

      {fleet.data && (
        <FleetSummary
          positions={fleet.data.positions}
          activeFilter={search.estado ?? null}
          onFilter={(state: MovementState | null) => setSearch({ estado: state ?? undefined })}
        />
      )}

      {fleet.data?.truncated && (
        <p className="flex items-center gap-2 rounded-sm border border-alert bg-surface-sunken px-3 py-2 text-xs text-text-primary">
          <AlertTriangle size={14} className="text-alert" aria-hidden="true" />
          Se están mostrando {fleet.data.positions.length} de {fleet.data.total.toLocaleString('es-CO')}{' '}
          vehículos. Filtre para ver el resto.
        </p>
      )}

      {fleet.isError && (
        <p className="text-sm text-critical">
          No se pudo consultar la flota. Las posiciones que se ven abajo, si las hay, no están
          actualizadas.
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-rows-[auto_320px_auto] gap-0 overflow-hidden rounded-sm border border-border md:grid-cols-[260px_1fr_320px] md:grid-rows-1">
        <div className="min-h-0 overflow-y-auto border-b border-border bg-surface md:border-b-0 md:border-r">
          {positions.length === 0 && !fleet.isLoading ? (
            <EmptyState
              title="Ningún vehículo con este filtro"
              description={
                search.estado
                  ? `No hay vehículos en estado «${MOVEMENT_STYLE[search.estado].label}».`
                  // Sin filtro, afirmar «no hay vehículos inscritos» era
                  // inventarse la causa: la consulta viene acotada al alcance
                  // de quien mira, y puede estar vacía por eso (docs/06 §8.8).
                  : 'Esta consola muestra sólo los vehículos que su rol alcanza. O ninguno está inscrito en telemetría, o su rol no alcanza ninguno.'
              }
            />
          ) : (
            <VehicleList
              positions={positions}
              selectedVehicleId={selectedVehicleId}
              onSelect={(vehicleId) => setSearch({ vehiculo: vehicleId })}
              labelFor={labelFor}
            />
          )}
        </div>

        <div className="min-h-0">
          <FleetMap
            positions={positions}
            selectedVehicleId={selectedVehicleId}
            onSelect={(vehicleId) => setSearch({ vehiculo: vehicleId ?? undefined })}
            labelFor={labelFor}
          />
        </div>

        {selectedVehicleId ? (
          <VehicleDetailsPanel
            label={labelFor(selectedVehicleId)}
            data={vehicle.data}
            isLoading={vehicle.isLoading}
            isError={vehicle.isError}
            onClose={() => setSearch({ vehiculo: undefined })}
            onShowTrips={() => {
              /* SPEC-0506 fase siguiente: el visor de recorridos. */
            }}
          />
        ) : (
          <aside className="hidden border-l border-border bg-surface p-4 md:block">
            <p className="text-sm text-text-secondary">
              Seleccione un vehículo en la lista o en el mapa para ver su detalle.
            </p>
          </aside>
        )}
      </div>
    </div>
  )
}
