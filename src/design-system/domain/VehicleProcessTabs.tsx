import { useDeferredValue, useState, type ReactNode } from 'react'
import { Badge } from '@/design-system/primitives/Badge'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import { MissionTypesDialog } from '@/design-system/domain/MissionTypesDialog'
import { AssignmentHistoryPanel, FuelHistoryPanel, MaintenancePanel } from '@/design-system/domain/VehicleHistory'
import { formatDateTime } from '@/lib/format/formatDateTime'
import {
  useAssignableDrivers,
  useAssignmentHistory,
  useFuelHistory,
  useLinkableCases,
  useMaintenanceOrders,
  useMissionTypes,
  useOperationalActions,
  useVehicleMetrics,
  useVehicleSituation,
} from '@/lib/fleet/useFleetAdmin'
import {
  CASE_STATUS_LABEL,
  MAINTENANCE_TYPE_LABEL,
  VEHICLE_STATUS_LABEL,
  type OpenOrder,
  type ScheduledOrder,
  type VehicleSituation,
} from '@/lib/fleet/types'

/**
 * SPEC-0510 — la ficha del vehículo, por procesos.
 *
 * <p>Cada pestaña es un proceso con su ritmo, sus acciones y su historial:
 * misiones, mantenimiento, combustible. El Resumen no tiene formularios: dice
 * qué pasa ahora y cuánto ha trabajado el vehículo, y lleva a la pestaña donde
 * se actúa. Antes todo compartía una rejilla y ninguno de los procesos se leía.
 */

export type ProcessTab = 'misiones' | 'mantenimiento' | 'combustible'

const CARD = 'flex flex-col gap-3 rounded-md border border-border-strong bg-surface-raised p-4'
const SELECT =
  'h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary'

const STATUS_TONE = {
  AVAILABLE: 'active',
  IN_MISSION: 'alert',
  MAINTENANCE: 'alert',
  OUT_OF_SERVICE: 'critical',
} as const

function errorOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/** `datetime-local` entrega hora local sin zona; el backend quiere un instante. */
function toInstant(localValue: string): string | undefined {
  return localValue ? new Date(localValue).toISOString() : undefined
}

function money(value: number): string {
  return value.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className={CARD} aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className={value ? 'text-sm text-text-primary' : 'text-sm text-text-muted'}>{value || 'Sin registrar'}</dd>
    </div>
  )
}

function useSituation(vehicleId: string) {
  const situation = useVehicleSituation(vehicleId)
  const loading = situation.isLoading ? <p className="text-sm text-text-secondary">Cargando…</p> : null
  const failed = situation.isError ? (
    <p className="text-sm text-critical">No se pudo cargar la situación del vehículo.</p>
  ) : null
  return { data: situation.data, placeholder: loading ?? failed }
}

// --- Resumen -------------------------------------------------------------------------------------

/** Qué pasa ahora, en una frase, y a dónde ir para actuar. Sin formularios. */
export function NowCard({ vehicleId, onGo }: { vehicleId: string; onGo: (tab: ProcessTab) => void }) {
  const { data, placeholder } = useSituation(vehicleId)
  if (!data) return <Section title="Ahora">{placeholder}</Section>

  const next = data.scheduledOrders?.[0]

  return (
    <Section
      title="Ahora"
      action={<Badge tone={STATUS_TONE[data.status]}>{VEHICLE_STATUS_LABEL[data.status]}</Badge>}
    >
      <NowSentence situation={data} />
      {next && (
        <p className="text-sm text-text-secondary">
          Próximo mantenimiento: {next.description}, programado para el {formatDateTime(next.scheduledFor)}
          {next.due && <Badge tone="critical" className="ml-2">Atrasado</Badge>}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {data.status === 'IN_MISSION' && (
          <Button variant="secondary" size="sm" onClick={() => onGo('misiones')}>Ver la misión</Button>
        )}
        {data.status === 'AVAILABLE' && (
          <Button variant="secondary" size="sm" onClick={() => onGo('misiones')}>Asignar a una misión</Button>
        )}
        {(data.status === 'MAINTENANCE' || next) && (
          <Button variant="secondary" size="sm" onClick={() => onGo('mantenimiento')}>Ver mantenimiento</Button>
        )}
      </div>
    </Section>
  )
}

function NowSentence({ situation }: { situation: VehicleSituation }) {
  const { mission } = situation
  const openOrders = situation.openOrders ?? []
  switch (situation.status) {
    case 'IN_MISSION':
      return mission ? (
        <p className="text-sm text-text-primary">
          En misión desde el {formatDateTime(mission.since)}
          {mission.driverName ? ` con ${mission.driverName}` : ''}
          {mission.missionTypeName ? ` · ${mission.missionTypeName}` : ''}
          {mission.caseTrackingNumber ? ` · caso ${mission.caseTrackingNumber}` : ''}.
          {mission.expectedEndAt ? ` Fin estimado: ${formatDateTime(mission.expectedEndAt)}.` : ''}
          {mission.overdue && <Badge tone="critical" className="ml-2">Vencida</Badge>}
        </p>
      ) : (
        <p className="text-sm text-text-primary">En misión.</p>
      )
    case 'MAINTENANCE':
      return (
        <p className="text-sm text-text-primary">
          En el taller con {openOrders.length} {openOrders.length === 1 ? 'orden abierta' : 'órdenes abiertas'}. Sale
          cuando se cierre la última.
          {openOrders.some((order) => order.overdue) && <Badge tone="critical" className="ml-2">Vencido</Badge>}
        </p>
      )
    case 'OUT_OF_SERVICE':
      return (
        <p className="text-sm text-text-primary">
          Fuera de servicio. Motivo: {situation.decommissionReason || 'sin registrar'}.
        </p>
      )
    default:
      return <p className="text-sm text-text-primary">Disponible para una misión.</p>
  }
}

/**
 * Un número que no llegó se muestra «sin dato», no revienta la ficha: la
 * pantalla no debe caerse entera porque una respuesta venga incompleta.
 */
function count(value: number | null | undefined): string | null {
  return value == null ? null : value.toLocaleString('es-CO')
}

function Metric({ label, value, hint }: { label: string; value: string | null; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-text-secondary">{label}</dt>
      {/* La pista va DENTRO del `dd`: un `<p>` suelto entre `dt`/`dd` rompe la
          lista de definiciones para un lector de pantalla (axe: definition-list). */}
      <dd>
        <span className={value == null ? 'text-lg text-text-muted' : 'text-lg font-semibold text-text-primary'}>
          {value ?? 'Sin dato'}
        </span>
        {hint && <span className="block text-xs text-text-secondary">{hint}</span>}
      </dd>
    </div>
  )
}

/**
 * SPEC-0510 Decisión 4. Un dato que no se puede calcular dice «sin dato»: sin
 * tramos entre tanqueos no hay kilómetros medidos, y «0 km» sería falso.
 */
export function MetricsCard({ vehicleId }: { vehicleId: string }) {
  const metrics = useVehicleMetrics(vehicleId)

  if (!metrics.data) {
    return (
      <Section title="Últimos 30 días">
        <p className={metrics.isError ? 'text-sm text-critical' : 'text-sm text-text-secondary'}>
          {metrics.isError ? 'No se pudieron calcular las métricas.' : 'Calculando…'}
        </p>
      </Section>
    )
  }

  const m = metrics.data
  return (
    <Section title={`Últimos ${m.windowDays} días`}>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        <Metric label="Misiones" value={count(m.missions)} />
        <Metric
          label="Kilómetros"
          value={m.kilometers == null ? null : `${m.kilometers.toLocaleString('es-CO')} km`}
          hint={m.kilometers == null ? 'Hacen falta dos tanqueos con el odómetro' : 'Por odómetro, entre tanqueos'}
        />
        <Metric
          label="Rendimiento"
          value={m.averageKmPerLiter == null ? null : `${m.averageKmPerLiter.toLocaleString('es-CO')} km/l`}
        />
        <Metric
          label="Combustible"
          value={m.fuelLiters == null ? null : `${m.fuelLiters.toLocaleString('es-CO')} l`}
          hint={
            m.fuelCost == null
              ? m.fuelLiters == null ? 'Sin tanqueos registrados' : 'Sin costo registrado'
              : `${money(m.fuelCost)}${m.loadsWithoutCost > 0 ? ` · ${m.loadsWithoutCost} sin costo` : ''}`
          }
        />
        <Metric label="Días en taller" value={count(m.workshopDays)} />
        <Metric
          label="Órdenes"
          value={m.openOrders == null || m.scheduledOrders == null
            ? null
            : `${m.openOrders} en taller · ${m.scheduledOrders} programadas`}
        />
      </dl>
    </Section>
  )
}

// --- Misiones ------------------------------------------------------------------------------------

export function MissionsTab({
  vehicleId,
  canManage,
  canManageCatalog,
}: {
  vehicleId: string
  canManage: boolean
  canManageCatalog: boolean
}) {
  const { data, placeholder } = useSituation(vehicleId)
  const history = useAssignmentHistory(vehicleId)

  return (
    <div className="flex flex-col gap-4">
      {placeholder}
      {data?.status === 'IN_MISSION' && data.mission && (
        <Section
          title="Misión en curso"
          action={data.mission.overdue ? <Badge tone="critical">Vencida</Badge> : undefined}
        >
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 xl:grid-cols-6">
            <Detail label="Conductor" value={data.mission.driverName} />
            <Detail label="Tipo de misión" value={data.mission.missionTypeName ?? 'Sin tipo registrado'} />
            <Detail label="Caso" value={data.mission.caseTrackingNumber} />
            <Detail label="Propósito" value={data.mission.purpose} />
            <Detail label="Desde" value={formatDateTime(data.mission.since)} />
            <Detail
              label="Fin estimado"
              value={data.mission.expectedEndAt ? formatDateTime(data.mission.expectedEndAt) : null}
            />
          </dl>
          {canManage && <EndMissionForm vehicleId={vehicleId} />}
        </Section>
      )}
      {data?.status === 'AVAILABLE' && canManage && (
        <AssignForm vehicleId={vehicleId} canManageCatalog={canManageCatalog} />
      )}
      {data?.status === 'MAINTENANCE' && (
        <Section title="Misión">
          <p className="text-sm text-text-secondary">
            Está en el taller: no sale a misión hasta que se cierre su última orden.
          </p>
        </Section>
      )}
      {data?.status === 'OUT_OF_SERVICE' && (
        <Section title="Misión">
          <p className="text-sm text-text-secondary">Fuera de servicio: no se asigna a misiones.</p>
        </Section>
      )}

      <Section title="Historial de misiones">
        {history.data ? <AssignmentHistoryPanel assignments={history.data} /> : (
          <p className="text-sm text-text-secondary">{history.isError ? 'No se pudo cargar.' : 'Cargando…'}</p>
        )}
      </Section>
    </div>
  )
}

/** SPEC-0509 CA-5/CA-6: terminar la misión; si va al taller, la avería es obligatoria. */
function EndMissionForm({ vehicleId }: { vehicleId: string }) {
  const { endMission } = useOperationalActions(vehicleId)
  const [note, setNote] = useState('')
  const [odometer, setOdometer] = useState('')
  const [toWorkshop, setToWorkshop] = useState(false)
  const [reason, setReason] = useState('')

  return (
    <form
      className="flex flex-col gap-2 border-t border-border pt-3"
      onSubmit={(event) => {
        event.preventDefault()
        void endMission.mutateAsync({
          sendToMaintenance: toWorkshop,
          ...(note ? { closingNote: note } : {}),
          ...(odometer ? { returnOdometerKm: Number(odometer) } : {}),
          ...(toWorkshop ? { workshopReason: reason } : {}),
        }).catch(() => undefined)
      }}
    >
      <p className="text-sm font-semibold text-text-primary">Terminar misión</p>
      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm text-text-primary">
          Observación
          <Input value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />
        </label>
        <label className="flex w-44 flex-col gap-1 text-sm text-text-primary">
          Odómetro de regreso (km)
          <Input type="number" min={0} value={odometer} onChange={(event) => setOdometer(event.target.value)} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-text-primary">
        <input type="checkbox" checked={toWorkshop} onChange={(event) => setToWorkshop(event.target.checked)} />
        Enviar al taller
      </label>
      {toWorkshop && (
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Qué avería tiene *
          <Input value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
          <span className="text-xs text-text-secondary">Abre una orden de mantenimiento con esta descripción.</span>
        </label>
      )}
      {endMission.isError && (
        <p className="text-sm text-critical">{errorOf(endMission.error, 'No se pudo terminar la misión.')}</p>
      )}
      <div>
        <Button type="submit" variant="primary" size="sm" loading={endMission.isPending}
                disabled={toWorkshop && reason.trim() === ''}>
          Terminar misión
        </Button>
      </div>
    </form>
  )
}

/**
 * SPEC-0509 CA-7 y SPEC-0510 Decisión 2: el tipo sale del catálogo y el caso de
 * una lista — casos abiertos de la unidad del vehículo. Nadie teclea un radicado
 * que puede no existir.
 */
function AssignForm({ vehicleId, canManageCatalog }: { vehicleId: string; canManageCatalog: boolean }) {
  const { assign } = useOperationalActions(vehicleId)
  const drivers = useAssignableDrivers()
  const types = useMissionTypes()
  const [driverId, setDriverId] = useState('')
  const [missionTypeId, setMissionTypeId] = useState('')
  const [caseFilter, setCaseFilter] = useState('')
  const [caseFileId, setCaseFileId] = useState('')
  const [purpose, setPurpose] = useState('')
  const [expectedEnd, setExpectedEnd] = useState('')
  const cases = useLinkableCases(vehicleId, useDeferredValue(caseFilter))

  const activeTypes = (types.data ?? []).filter((type) => type.active)
  const caseOptions = cases.data ?? []

  return (
    <form
      className={CARD}
      aria-label="Asignar a una misión"
      onSubmit={(event) => {
        event.preventDefault()
        void assign.mutateAsync({
          driverId,
          missionTypeId,
          ...(caseFileId ? { caseFileId } : {}),
          ...(purpose ? { purpose } : {}),
          ...(expectedEnd ? { expectedEndAt: new Date(expectedEnd).toISOString() } : {}),
        }).catch(() => undefined)
      }}
    >
      <h2 className="text-sm font-semibold text-text-primary">Asignar a una misión</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Conductor *
          <select value={driverId} onChange={(event) => setDriverId(event.target.value)} className={SELECT}>
            <option value="">Seleccione…</option>
            {(drivers.data ?? []).map((driver) => (
              <option key={driver.id} value={driver.id}>{driver.displayName}</option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="mission-type" className="text-sm text-text-primary">Tipo de misión *</label>
            {/* SPEC-0510 CA-12: el catálogo, también desde aquí, para quien puede gestionarlo. */}
            {canManageCatalog && <MissionTypesDialog triggerLabel="Gestionar tipos" />}
          </div>
          <select id="mission-type" value={missionTypeId} onChange={(event) => setMissionTypeId(event.target.value)}
                  className={SELECT}>
            <option value="">Seleccione…</option>
            {activeTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
          {types.data && activeTypes.length === 0 && (
            <span className="text-xs text-text-secondary">
              No hay tipos de misión.{canManageCatalog ? ' Créelos con «Gestionar tipos».' : ' Pídale a un administrador que los cree.'}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1 md:col-span-2">
          <label htmlFor="case-filter" className="text-sm text-text-primary">Caso vinculado</label>
          <div className="flex flex-wrap gap-2">
            <Input id="case-filter" className="w-48" placeholder="Filtrar por radicado" value={caseFilter}
                   aria-label="Filtrar casos por radicado" onChange={(event) => setCaseFilter(event.target.value)} />
            <select aria-label="Caso vinculado" value={caseFileId} onChange={(event) => setCaseFileId(event.target.value)}
                    className={`${SELECT} min-w-[16rem] flex-1`}>
              <option value="">Sin caso</option>
              {caseOptions.map((linkable) => (
                <option key={linkable.id} value={linkable.id}>
                  {linkable.trackingNumber} · {CASE_STATUS_LABEL[linkable.status] ?? linkable.status}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs text-text-secondary">
            {cases.isError
              ? 'No se pudieron cargar los casos.'
              : caseOptions.length === 0 && cases.data
                ? 'No hay casos abiertos en la unidad de este vehículo.'
                : 'Sólo casos abiertos de la unidad del vehículo. Se ve el radicado y el estado, no el expediente.'}
          </span>
        </div>
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Propósito
          <Input value={purpose} maxLength={500} onChange={(event) => setPurpose(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Fin estimado
          <Input type="datetime-local" value={expectedEnd} onChange={(event) => setExpectedEnd(event.target.value)} />
          <span className="text-xs text-text-secondary">Pasada esta fecha sin terminar, el inventario la señala como vencida.</span>
        </label>
      </div>
      {assign.isError && <p className="text-sm text-critical">{errorOf(assign.error, 'No se pudo asignar.')}</p>}
      <div>
        <Button type="submit" variant="primary" size="sm" loading={assign.isPending} disabled={!driverId || !missionTypeId}>
          Asignar vehículo
        </Button>
      </div>
    </form>
  )
}

// --- Mantenimiento -------------------------------------------------------------------------------

export function MaintenanceTab({ vehicleId, canManage }: { vehicleId: string; canManage: boolean }) {
  const { data, placeholder } = useSituation(vehicleId)
  const orders = useMaintenanceOrders(vehicleId)
  const finished = (orders.data ?? []).filter((order) => order.status === 'CLOSED' || order.status === 'CANCELLED')

  return (
    <div className="flex flex-col gap-4">
      {placeholder}
      {data && (data.openOrders ?? []).length > 0 && (
        <Section title="En el taller">
          <p className="text-sm text-text-secondary">Sale del taller cuando se cierre su última orden abierta.</p>
          <ul className="flex flex-col gap-3" aria-label="Órdenes abiertas">
            {(data.openOrders ?? []).map((order) => (
              <OpenOrderItem key={order.orderId} order={order} vehicleId={vehicleId} canManage={canManage} />
            ))}
          </ul>
        </Section>
      )}
      {data && (data.scheduledOrders ?? []).length > 0 && (
        <Section title="Programado">
          <ul className="flex flex-col gap-3" aria-label="Órdenes programadas">
            {(data.scheduledOrders ?? []).map((order) => (
              <ScheduledOrderItem key={order.orderId} order={order} vehicleId={vehicleId}
                                  canManage={canManage} inMission={data.status === 'IN_MISSION'} />
            ))}
          </ul>
        </Section>
      )}
      {data && canManage && data.status !== 'OUT_OF_SERVICE' && (
        <NewOrderForm vehicleId={vehicleId} inMission={data.status === 'IN_MISSION'} />
      )}
      <Section title="Historial de mantenimiento">
        {orders.data ? <MaintenancePanel orders={finished} /> : (
          <p className="text-sm text-text-secondary">{orders.isError ? 'No se pudo cargar.' : 'Cargando…'}</p>
        )}
      </Section>
    </div>
  )
}

function OpenOrderItem({ order, vehicleId, canManage }: { order: OpenOrder; vehicleId: string; canManage: boolean }) {
  return (
    <li className="flex flex-col gap-2 rounded-sm border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-text-primary">{order.description}</p>
        <Badge tone="neutral">{MAINTENANCE_TYPE_LABEL[order.orderType] ?? order.orderType}</Badge>
        {order.overdue && <Badge tone="critical">Vencida</Badge>}
      </div>
      <p className="text-xs text-text-secondary">
        En el taller desde el {formatDateTime(order.openedAt)}
        {' · '}
        {order.expectedExitAt ? `salida estimada ${formatDateTime(order.expectedExitAt)}` : 'sin salida estimada'}
      </p>
      {canManage && <CloseOrderForm vehicleId={vehicleId} orderId={order.orderId} />}
    </li>
  )
}

/** SPEC-0509 CA-3: la observación es obligatoria — es la respuesta a «¿qué le hicieron?». */
function CloseOrderForm({ vehicleId, orderId }: { vehicleId: string; orderId: string }) {
  const { closeOrder } = useOperationalActions(vehicleId)
  const [note, setNote] = useState('')
  const [cost, setCost] = useState('')

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void closeOrder.mutateAsync({ orderId, closingNote: note, ...(cost ? { cost: Number(cost) } : {}) })
          .catch(() => undefined)
      }}
    >
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm text-text-primary">
        Qué se le hizo *
        <Input value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />
      </label>
      <label className="flex w-36 flex-col gap-1 text-sm text-text-primary">
        Costo
        <Input type="number" min={0} value={cost} onChange={(event) => setCost(event.target.value)} />
      </label>
      <Button type="submit" variant="primary" size="sm" loading={closeOrder.isPending} disabled={note.trim() === ''}>
        Cerrar orden
      </Button>
      {closeOrder.isError && (
        <p className="w-full text-sm text-critical">{errorOf(closeOrder.error, 'No se pudo cerrar la orden.')}</p>
      )}
    </form>
  )
}

/** SPEC-0510 CA-7/CA-9: una programada ingresa al taller o se cancela diciendo por qué. */
function ScheduledOrderItem({
  order,
  vehicleId,
  canManage,
  inMission,
}: {
  order: ScheduledOrder
  vehicleId: string
  canManage: boolean
  inMission: boolean
}) {
  const { startOrder, cancelOrder } = useOperationalActions(vehicleId)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const error = startOrder.error ?? cancelOrder.error

  return (
    <li className="flex flex-col gap-2 rounded-sm border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-text-primary">{order.description}</p>
        <Badge tone="neutral">{MAINTENANCE_TYPE_LABEL[order.orderType] ?? order.orderType}</Badge>
        {order.due && <Badge tone="critical">Atrasado</Badge>}
      </div>
      <p className="text-xs text-text-secondary">
        Programado para el {formatDateTime(order.scheduledFor)}
        {order.expectedExitAt ? ` · salida estimada ${formatDateTime(order.expectedExitAt)}` : ''}
      </p>
      {canManage && !cancelling && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" loading={startOrder.isPending} disabled={inMission}
                  onClick={() => void startOrder.mutateAsync(order.orderId).catch(() => undefined)}>
            Ingresar al taller
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCancelling(true)}>Cancelar programación</Button>
          {inMission && (
            <span className="text-xs text-text-secondary">Está en misión: termine la misión antes de ingresarlo.</span>
          )}
        </div>
      )}
      {canManage && cancelling && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void cancelOrder.mutateAsync({ orderId: order.orderId, reason }).catch(() => undefined)
          }}
        >
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm text-text-primary">
            Por qué no se hará *
            <Input value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
          </label>
          <Button type="submit" variant="danger" size="sm" loading={cancelOrder.isPending} disabled={reason.trim() === ''}>
            Cancelar programación
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCancelling(false)}>Volver</Button>
        </form>
      )}
      {error && <p className="text-sm text-critical">{errorOf(error, 'No se pudo completar la acción.')}</p>}
    </li>
  )
}

/**
 * SPEC-0510 Decisión 3: ingresa ahora, o se programa. En misión sólo se puede
 * programar — misión y taller no coexisten —, y la pantalla lo dice en vez de
 * ofrecer un botón que el backend va a rechazar.
 */
function NewOrderForm({ vehicleId, inMission }: { vehicleId: string; inMission: boolean }) {
  const { openOrder } = useOperationalActions(vehicleId)
  const [mode, setMode] = useState<'now' | 'schedule'>(inMission ? 'schedule' : 'now')
  const [orderType, setOrderType] = useState<'PREVENTIVE' | 'CORRECTIVE'>('PREVENTIVE')
  const [description, setDescription] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')
  const [expectedExit, setExpectedExit] = useState('')
  const effectiveMode = inMission ? 'schedule' : mode

  return (
    <form
      className={CARD}
      aria-label="Nueva orden de mantenimiento"
      onSubmit={(event) => {
        event.preventDefault()
        void openOrder.mutateAsync({
          orderType,
          description,
          ...(effectiveMode === 'schedule' && scheduledFor ? { scheduledFor: toInstant(scheduledFor) ?? '' } : {}),
          ...(expectedExit ? { expectedExitAt: toInstant(expectedExit) ?? '' } : {}),
        })
          .then(() => { setDescription(''); setScheduledFor(''); setExpectedExit('') })
          .catch(() => undefined)
      }}
    >
      <h2 className="text-sm font-semibold text-text-primary">Nueva orden de mantenimiento</h2>
      <fieldset className="flex flex-wrap gap-4 text-sm text-text-primary">
        <legend className="sr-only">Cuándo</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="when" checked={effectiveMode === 'now'} disabled={inMission}
                 onChange={() => setMode('now')} />
          Ingresa al taller ahora
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="when" checked={effectiveMode === 'schedule'} onChange={() => setMode('schedule')} />
          Programar
        </label>
      </fieldset>
      {inMission && (
        <p className="text-xs text-text-secondary">
          Está en misión: sólo se puede programar. Para llevarlo al taller ya, termine la misión marcando «Enviar al taller».
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Tipo
          <select value={orderType} onChange={(event) => setOrderType(event.target.value as 'PREVENTIVE' | 'CORRECTIVE')}
                  className={SELECT}>
            <option value="PREVENTIVE">Preventivo</option>
            <option value="CORRECTIVE">Correctivo</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Qué se va a hacer *
          <Input value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} />
        </label>
        {effectiveMode === 'schedule' && (
          <label className="flex flex-col gap-1 text-sm text-text-primary">
            Programado para *
            <Input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Salida estimada
          <Input type="datetime-local" value={expectedExit} onChange={(event) => setExpectedExit(event.target.value)} />
        </label>
      </div>
      {openOrder.isError && <p className="text-sm text-critical">{errorOf(openOrder.error, 'No se pudo registrar la orden.')}</p>}
      <div>
        <Button type="submit" variant="primary" size="sm" loading={openOrder.isPending}
                disabled={description.trim() === '' || (effectiveMode === 'schedule' && !scheduledFor)}>
          {effectiveMode === 'schedule' ? 'Programar' : 'Abrir orden'}
        </Button>
      </div>
    </form>
  )
}

// --- Combustible ---------------------------------------------------------------------------------

export function FuelTab({ vehicleId, canRecord }: { vehicleId: string; canRecord: boolean }) {
  const history = useFuelHistory(vehicleId)

  return (
    <div className="flex flex-col gap-4">
      {canRecord && <RecordFuelForm vehicleId={vehicleId} />}
      <Section title="Tanqueos">
        {history.data ? <FuelHistoryPanel history={history.data} /> : (
          <p className="text-sm text-text-secondary">{history.isError ? 'No se pudo cargar.' : 'Cargando…'}</p>
        )}
      </Section>
    </div>
  )
}

function RecordFuelForm({ vehicleId }: { vehicleId: string }) {
  const { recordFuel } = useOperationalActions(vehicleId)
  const [liters, setLiters] = useState('')
  const [cost, setCost] = useState('')
  const [odometerKm, setOdometerKm] = useState('')

  return (
    <form
      className={CARD}
      aria-label="Registrar combustible"
      onSubmit={(event) => {
        event.preventDefault()
        void recordFuel.mutateAsync({
          liters: Number(liters),
          ...(cost ? { cost: Number(cost) } : {}),
          ...(odometerKm ? { odometerKm: Number(odometerKm) } : {}),
        })
          .then(() => { setLiters(''); setCost(''); setOdometerKm('') })
          .catch(() => undefined)
      }}
    >
      <h2 className="text-sm font-semibold text-text-primary">Registrar combustible</h2>
      <div className="flex flex-wrap gap-2">
        <label className="flex w-36 flex-col gap-1 text-sm text-text-primary">
          Litros *
          <Input type="number" min={0} value={liters} onChange={(event) => setLiters(event.target.value)} />
        </label>
        <label className="flex w-40 flex-col gap-1 text-sm text-text-primary">
          Costo
          <Input type="number" min={0} value={cost} onChange={(event) => setCost(event.target.value)} />
        </label>
        <label className="flex w-40 flex-col gap-1 text-sm text-text-primary">
          Odómetro (km)
          <Input type="number" min={0} value={odometerKm} onChange={(event) => setOdometerKm(event.target.value)} />
        </label>
      </div>
      <p className="text-xs text-text-secondary">Con el odómetro se calcula el rendimiento del tramo desde el tanqueo anterior.</p>
      {recordFuel.isError && <p className="text-sm text-critical">{errorOf(recordFuel.error, 'No se pudo registrar.')}</p>}
      <div>
        <Button type="submit" variant="primary" size="sm" loading={recordFuel.isPending} disabled={!liters.trim()}>
          Registrar
        </Button>
      </div>
    </form>
  )
}
