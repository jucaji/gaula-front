import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { customFetch } from '@/api/client'
import type { VehicleResponse } from '@/api/generated/models'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import {
  CorrectVehiclePanel,
  TransferVehiclePanel,
  VehicleDevicePanel,
  VehicleServiceStatusPanel,
} from '@/design-system/domain/VehicleAdminPanels'
import { FleetNav } from '@/design-system/patterns/FleetNav'
import { VehicleSummaryCard } from '@/design-system/domain/VehicleSummaryCard'
import { VehicleSituationPanel } from '@/design-system/domain/VehicleSituationPanel'
import { VehicleLocationPanel } from '@/design-system/domain/VehicleLocationPanel'
import {
  AssignmentHistoryPanel,
  FuelHistoryPanel,
  MaintenancePanel,
  VehicleTimelinePanel,
} from '@/design-system/domain/VehicleHistory'
import {
  useAssignmentHistory,
  useDevices,
  useFuelHistory,
  useMaintenanceOrders,
  useTerritorialUnits,
  useVehicleEvents,
} from '@/lib/fleet/useFleetAdmin'
import type { Vehicle } from '@/lib/fleet/types'

export const Route = createFileRoute('/recursos/flota/$vehicleId')({
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'FLEET')) {
      throw redirect({ to: '/', search: { denied: 'FLEET' } })
    }
  },
  component: VehicleDetailPage,
})

type TabId = 'resumen' | 'historial' | 'ubicacion'

const TABS: { id: TabId; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'historial', label: 'Historial' },
  { id: 'ubicacion', label: 'Ubicación' },
]

function useVehicle(vehicleId: string) {
  return useQuery({
    queryKey: ['resource', 'vehicles', vehicleId],
    queryFn: () => customFetch<VehicleResponse & { version?: number }>(`/api/v1/vehicles/${vehicleId}`),
    networkMode: 'always',
    retry: false,
  })
}

function VehicleDetailPage() {
  const { vehicleId } = Route.useParams()
  const queryClient = useQueryClient()
  const vehicle = useVehicle(vehicleId)
  const { can } = Route.useRouteContext()
  const canManage = can('UPDATE', 'FLEET')
  const canManageDevices = can('UPDATE', 'TRACKING_DEVICE')
  // La ubicación va detrás de SU propio recurso: la unidad administrativa
  // gestiona la flota y no ve la operación (docs/04 §2.4). Sin permiso, la
  // pestaña no existe y la consulta ni se hace.
  const canSeeLocation = can('READ', 'VEHICLE_TELEMETRY')
  const [activeTab, setTab] = useState<TabId>('resumen')
  const units = useTerritorialUnits()
  const devices = useDevices(canManageDevices)
  const hasDevice = canManageDevices && devices.data
    ? (devices.data.content ?? []).some((device) => device.vehicleId === vehicleId)
    : null

  const [liters, setLiters] = useState('')
  const [cost, setCost] = useState('')
  const [odometerKm, setOdometerKm] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['resource', 'vehicles', vehicleId] })
    await queryClient.invalidateQueries({ queryKey: ['resource', 'vehicle-assignments'] })
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      await invalidate()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo completar la acción.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Asigna el vehículo.
   *
   * <p>El caso se escribe por RADICADO —`GAULA-BOG-2026-000004`—, que es lo que
   * una persona conoce, y se traduce aquí a su identificador. Antes el campo
   * pedía el UUID y quien escribía el radicado recibía un 500: el backend ya
   * responde 400 a eso, pero el arreglo de fondo es no pedir un dato que nadie
   * tiene a mano.
   */
  async function handleRecordFuel() {
    if (!liters.trim()) return
    await run(() =>
      customFetch(`/api/v1/vehicles/${vehicleId}/fuel`, {
        method: 'POST',
        body: JSON.stringify({
          liters: Number(liters),
          cost: cost ? Number(cost) : undefined,
          odometerKm: odometerKm ? Number(odometerKm) : undefined,
          loadedAt: new Date().toISOString(),
        }),
      }),
    )
    setLiters('')
    setCost('')
    setOdometerKm('')
  }

  if (vehicle.isLoading) return <p className="p-6 text-sm text-text-secondary">Cargando…</p>
  if (vehicle.isError || !vehicle.data) return <p className="p-6 text-sm text-critical">No se pudo cargar el vehículo.</p>

  const data = vehicle.data

  return (
    <div className="flex flex-col gap-4">
      <FleetNav />

      {/* `accent-hover` y no `accent`: pine-600 sobre la superficie de la página
          se queda por debajo del 4.5:1 de WCAG AA. Es la tercera vez que este
          mismo token se cuela (ver AppShell, S14.FE.05). */}
      <Link
        to="/recursos/flota"
        search={{ page: 0, size: 20 }}
        // `min-h-[var(--tap-min)]` porque es un enlace suelto, no uno incrustado
        // en una frase: WCAG 2.5.8 sólo exime a los segundos, y un dedo no acierta
        // 19 px de alto.
        className="inline-flex min-h-[var(--tap-min)] w-fit items-center text-sm text-accent-hover underline"
      >
        ← Volver al inventario
      </Link>

      {/* SPEC-0508: la tarjeta que faltaba. Antes había que abrir el formulario
          de corrección para ver la marca o el modelo -- una consulta convertida
          en un amago de edición. */}
      <VehicleSummaryCard vehicle={data as Vehicle} units={units.data ?? []} hasDevice={hasDevice} />

      <nav className="flex gap-1 border-b border-border" aria-label="Secciones de la ficha">
        {TABS.filter((tab) => tab.id !== 'ubicacion' || canSeeLocation).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={`flex min-h-[var(--tap-min)] items-center border-b-2 px-3 py-2 text-sm transition-colors duration-instant ${
              activeTab === tab.id
                ? 'border-accent text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {actionError && <p className="text-sm text-critical">{actionError}</p>}

      {activeTab === 'historial' && <HistoryTab vehicleId={vehicleId} />}
      {activeTab === 'ubicacion' && canSeeLocation && <VehicleLocationPanel vehicleId={vehicleId} />}

      {/* Rejilla, no columna: las tarjetas de acción son independientes entre
          sí y caben en paralelo. En una columna estrecha —como estaba— la
          pantalla dejaba media ventana vacía y obligaba a bajar para ver que
          existían. Se mantiene una sola columna en pantallas angostas. */}
      <div
        className={
          activeTab === 'resumen'
            ? 'grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3'
            : 'hidden'
        }
      >
        {/* SPEC-0509: el porqué del estado y sólo las acciones que permite. Sustituye
            a los paneles apilados que ofrecían «Asignar» a un vehículo en el taller. */}
        <VehicleSituationPanel vehicleId={vehicleId} canManage={canManage} />

      {/* SPEC-0507: lo que faltaba -- administrar el vehículo, no sólo operarlo.
          Cada panel se dibuja sólo si el rol lo alcanza (docs/04 §2.4). */}
      {canManage && (
        <>
          <CorrectVehiclePanel vehicle={data as Vehicle} />
          <TransferVehiclePanel vehicle={data as Vehicle} />
          <VehicleServiceStatusPanel vehicle={data as Vehicle} />
        </>
      )}
      {canManageDevices && <VehicleDevicePanel vehicle={data as Vehicle} />}

      {data.status !== 'OUT_OF_SERVICE' && (
        <div className="flex h-fit flex-col gap-2 rounded-md border border-border-strong bg-surface-raised p-4">
          <h2 className="text-sm font-semibold text-text-primary">Registrar combustible</h2>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm text-text-primary">
              Litros *
              <Input type="number" value={liters} onChange={(event) => setLiters(event.target.value)} />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm text-text-primary">
              Costo
              <Input type="number" value={cost} onChange={(event) => setCost(event.target.value)} />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm text-text-primary">
              Odómetro (km)
              <Input type="number" value={odometerKm} onChange={(event) => setOdometerKm(event.target.value)} />
            </label>
          </div>
          <div>
            <Button variant="secondary" size="sm" loading={busy} disabled={!liters.trim()} onClick={handleRecordFuel}>
              Registrar
            </Button>
          </div>
        </div>
      )}

      </div>
    </div>
  )
}

/**
 * SPEC-0508: la historia del vehículo, en un solo sitio.
 *
 * <p>Las cuatro consultas se piden juntas porque se leen juntas: quien entra a
 * esta pestaña quiere entender qué le ha pasado al vehículo, no elegir entre
 * cuatro listas.
 */
function HistoryTab({ vehicleId }: { vehicleId: string }) {
  const events = useVehicleEvents(vehicleId)
  const fuel = useFuelHistory(vehicleId)
  const maintenance = useMaintenanceOrders(vehicleId)
  const assignments = useAssignmentHistory(vehicleId)

  return (
    // Dos columnas en pantallas anchas. La línea de tiempo va a la izquierda y
    // ocupa el alto que necesite; el resto se apila a su lado en vez de
    // empujarla mil píxeles hacia abajo.
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <section>
        <h2 className="mb-2 text-sm font-semibold text-text-primary">Línea de tiempo</h2>
        {events.isLoading && <p className="text-sm text-text-secondary">Cargando…</p>}
        {events.data && <VehicleTimelinePanel events={events.data.content ?? []} />}
      </section>

      <div className="flex flex-col gap-6">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-text-primary">Combustible</h2>
          {fuel.isLoading && <p className="text-sm text-text-secondary">Cargando…</p>}
          {fuel.data && <FuelHistoryPanel history={fuel.data} />}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-text-primary">Mantenimiento</h2>
          {maintenance.isLoading && <p className="text-sm text-text-secondary">Cargando…</p>}
          {maintenance.data && <MaintenancePanel orders={maintenance.data} />}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-text-primary">Asignaciones</h2>
          {assignments.isLoading && <p className="text-sm text-text-secondary">Cargando…</p>}
          {assignments.data && <AssignmentHistoryPanel assignments={assignments.data} />}
        </section>
      </div>
    </div>
  )
}
