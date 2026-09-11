import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { customFetch } from '@/api/client'
import type { VehicleResponse } from '@/api/generated/models'
import {
  CorrectVehiclePanel,
  TransferVehiclePanel,
  VehicleDevicePanel,
  VehicleServiceStatusPanel,
} from '@/design-system/domain/VehicleAdminPanels'
import { FleetNav } from '@/design-system/patterns/FleetNav'
import { VehicleSummaryCard } from '@/design-system/domain/VehicleSummaryCard'
import { VehicleLocationPanel } from '@/design-system/domain/VehicleLocationPanel'
import { VehicleTimelinePanel } from '@/design-system/domain/VehicleHistory'
import {
  FuelTab,
  MaintenanceTab,
  MetricsCard,
  MissionsTab,
  NowCard,
} from '@/design-system/domain/VehicleProcessTabs'
import { useDevices, useTerritorialUnits, useVehicleEvents } from '@/lib/fleet/useFleetAdmin'
import type { Vehicle } from '@/lib/fleet/types'

const TAB_IDS = ['resumen', 'misiones', 'mantenimiento', 'combustible', 'ubicacion', 'historial', 'administracion'] as const
type TabId = (typeof TAB_IDS)[number]

/**
 * SPEC-0510 CA-2: la pestaña va en la URL, para poder enlazarla —«mire el
 * mantenimiento de OBG101»— y para que volver atrás regrese a donde se estaba.
 * Un valor que no existe cae al Resumen en vez de romper la página.
 */
const vehicleSearchSchema = z.object({
  tab: z.enum(TAB_IDS).optional().catch(undefined),
})

export const Route = createFileRoute('/recursos/flota/$vehicleId')({
  validateSearch: vehicleSearchSchema,
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'FLEET')) {
      throw redirect({ to: '/', search: { denied: 'FLEET' } })
    }
  },
  component: VehicleDetailPage,
})

const TAB_LABEL: Record<TabId, string> = {
  resumen: 'Resumen',
  misiones: 'Misiones',
  mantenimiento: 'Mantenimiento',
  combustible: 'Combustible',
  ubicacion: 'Ubicación',
  historial: 'Historial',
  administracion: 'Administración',
}

function useVehicle(vehicleId: string) {
  return useQuery({
    queryKey: ['resource', 'vehicles', vehicleId],
    queryFn: () => customFetch<VehicleResponse & { version?: number }>(`/api/v1/vehicles/${vehicleId}`),
    networkMode: 'always',
    retry: false,
  })
}

/**
 * SPEC-0510 Decisión 1: la ficha, por procesos.
 *
 * <p>Un vehículo se asigna a misiones, entra al taller, tanquea, se rastrea y
 * se administra. Son procesos distintos —el cliente lo dijo así— y cada uno
 * tiene su pestaña, con sus acciones y su historial. El Resumen no actúa:
 * cuenta qué pasa ahora y cuánto ha trabajado, y lleva a donde se actúa.
 */
function VehicleDetailPage() {
  const { vehicleId } = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  const vehicle = useVehicle(vehicleId)
  const { can } = Route.useRouteContext()
  const canManage = can('UPDATE', 'FLEET')
  const canManageCatalog = can('CREATE', 'FLEET')
  const canManageDevices = can('UPDATE', 'TRACKING_DEVICE')
  // La ubicación va detrás de SU propio recurso: la unidad administrativa
  // gestiona la flota y no ve la operación (docs/04 §2.4). Sin permiso, la
  // pestaña no existe y la consulta ni se hace.
  const canSeeLocation = can('READ', 'VEHICLE_TELEMETRY')
  const units = useTerritorialUnits()
  const devices = useDevices(canManageDevices)
  const hasDevice = canManageDevices && devices.data
    ? (devices.data.content ?? []).some((device) => device.vehicleId === vehicleId)
    : null

  const tabs = TAB_IDS.filter((id) =>
    (id !== 'ubicacion' || canSeeLocation) && (id !== 'administracion' || canManage || canManageDevices))
  const activeTab: TabId = tab && tabs.includes(tab) ? tab : 'resumen'
  const go = (next: TabId) => void navigate({ search: { tab: next === 'resumen' ? undefined : next } })

  if (vehicle.isLoading) return <p className="p-6 text-sm text-text-secondary">Cargando…</p>
  if (vehicle.isError || !vehicle.data) return <p className="p-6 text-sm text-critical">No se pudo cargar el vehículo.</p>

  const data = vehicle.data as Vehicle

  return (
    <div className="flex flex-col gap-4">
      <FleetNav />

      {/* `accent-hover` y no `accent`: pine-600 sobre la superficie de la página
          se queda por debajo del 4.5:1 de WCAG AA. */}
      <Link
        to="/recursos/flota"
        search={{ page: 0, size: 20 }}
        // `min-h-[var(--tap-min)]`: un enlace suelto necesita un blanco táctil
        // completo (WCAG 2.5.8).
        className="inline-flex min-h-[var(--tap-min)] w-fit items-center text-sm text-accent-hover underline"
      >
        ← Volver al inventario
      </Link>

      <VehicleSummaryCard vehicle={data} units={units.data ?? []} hasDevice={hasDevice} />

      <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label="Secciones de la ficha">
        {tabs.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => go(id)}
            aria-current={activeTab === id ? 'page' : undefined}
            className={`flex min-h-[var(--tap-min)] shrink-0 items-center border-b-2 px-3 py-2 text-sm transition-colors duration-instant ${
              activeTab === id
                ? 'border-accent text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {TAB_LABEL[id]}
          </button>
        ))}
      </nav>

      {activeTab === 'resumen' && (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <NowCard vehicleId={vehicleId} onGo={go} />
          <MetricsCard vehicleId={vehicleId} />
        </div>
      )}
      {activeTab === 'misiones' && (
        <MissionsTab vehicleId={vehicleId} canManage={canManage} canManageCatalog={canManageCatalog} />
      )}
      {activeTab === 'mantenimiento' && <MaintenanceTab vehicleId={vehicleId} canManage={canManage} />}
      {activeTab === 'combustible' && (
        <FuelTab vehicleId={vehicleId} canRecord={canManage && data.status !== 'OUT_OF_SERVICE'} />
      )}
      {activeTab === 'ubicacion' && canSeeLocation && <VehicleLocationPanel vehicleId={vehicleId} />}
      {activeTab === 'historial' && <TimelineTab vehicleId={vehicleId} />}
      {activeTab === 'administracion' && (
        // SPEC-0510 Decisión 5: columnas que FLUYEN, no filas alineadas. En una
        // rejilla, cada fila medía lo que su tarjeta más alta y la siguiente
        // quedaba lejos de la anterior; aquí cada tarjeta va pegada a la de
        // arriba, y un formulario que se despliega empuja a las de abajo.
        <div className="columns-1 gap-4 md:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
          {canManage && (
            <>
              <CorrectVehiclePanel vehicle={data} />
              <TransferVehiclePanel vehicle={data} />
              <VehicleServiceStatusPanel vehicle={data} />
            </>
          )}
          {canManageDevices && <VehicleDevicePanel vehicle={data} />}
        </div>
      )}
    </div>
  )
}

/**
 * La línea de tiempo: todo lo que le ha pasado al vehículo, de todos los
 * procesos, en un solo hilo. El detalle de cada proceso está en su pestaña.
 */
function TimelineTab({ vehicleId }: { vehicleId: string }) {
  const events = useVehicleEvents(vehicleId)
  if (events.isLoading) return <p className="text-sm text-text-secondary">Cargando…</p>
  if (events.isError) return <p className="text-sm text-critical">No se pudo cargar la línea de tiempo.</p>
  return <VehicleTimelinePanel events={events.data?.content ?? []} />
}
