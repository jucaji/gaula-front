import { useState } from 'react'
import { Badge } from '@/design-system/primitives/Badge'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import { customFetch } from '@/api/client'
import { formatDateTime } from '@/lib/format/formatDateTime'
import {
  useAssignableDrivers,
  useMissionTypes,
  useOperationalActions,
  useVehicleSituation,
} from '@/lib/fleet/useFleetAdmin'
import { MAINTENANCE_TYPE_LABEL, type OpenOrder, type VehicleStatus } from '@/lib/fleet/types'

const CARD = 'flex h-fit flex-col gap-3 rounded-md border border-border-strong bg-surface-raised p-4'
const SELECT =
  'h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary'

function errorOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/** `datetime-local` entrega hora local sin zona; el backend quiere un instante. */
function toInstant(localValue: string): string | undefined {
  return localValue ? new Date(localValue).toISOString() : undefined
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className={value ? 'text-sm text-text-primary' : 'text-sm text-text-muted'}>{value || 'Sin registrar'}</dd>
    </div>
  )
}

/**
 * SPEC-0509 Decisión 4: el porqué del estado, y sólo las acciones que ese
 * estado permite.
 *
 * <p>No hay un selector de «cambiar estado», y es deliberado: un desplegable
 * libre es exactamente como el estado y los registros se separaron (vehículos
 * en el taller sin orden, en misión sin asignación). Cada estado sale del acto
 * que lo justifica: terminar la misión, cerrar la orden, reactivar.
 */
export function VehicleSituationPanel({ vehicleId, canManage }: { vehicleId: string; canManage: boolean }) {
  const situation = useVehicleSituation(vehicleId)

  if (situation.isLoading) return <div className={CARD}><p className="text-sm text-text-secondary">Cargando la situación…</p></div>
  if (situation.isError || !situation.data) {
    return <div className={CARD}><p className="text-sm text-critical">No se pudo cargar la situación del vehículo.</p></div>
  }

  const { status, mission, openOrders, decommissionReason } = situation.data

  return (
    <section className={`${CARD} md:col-span-2 xl:col-span-3`} aria-label="Situación actual">
      <h2 className="text-sm font-semibold text-text-primary">Situación actual</h2>

      {status === 'IN_MISSION' && mission && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="alert">En misión</Badge>
            {mission.overdue && <Badge tone="critical">Vencida</Badge>}
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 xl:grid-cols-6">
            <Detail label="Conductor" value={mission.driverName} />
            <Detail label="Tipo de misión" value={mission.missionTypeName ?? 'Sin tipo registrado'} />
            <Detail label="Caso" value={mission.caseTrackingNumber} />
            <Detail label="Propósito" value={mission.purpose} />
            <Detail label="Desde" value={formatDateTime(mission.since)} />
            <Detail label="Fin estimado" value={mission.expectedEndAt ? formatDateTime(mission.expectedEndAt) : null} />
          </dl>
          {canManage && <EndMissionForm vehicleId={vehicleId} />}
        </div>
      )}

      {status === 'MAINTENANCE' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">
            Sale del taller cuando se cierre su última orden abierta.
          </p>
          <ul className="flex flex-col gap-3" aria-label="Órdenes abiertas">
            {openOrders.map((order) => (
              <OpenOrderItem key={order.orderId} order={order} vehicleId={vehicleId} canManage={canManage} />
            ))}
          </ul>
          {canManage && <OpenOrderForm vehicleId={vehicleId} title="Abrir otra orden" />}
        </div>
      )}

      {status === 'AVAILABLE' && (
        <div className="flex flex-col gap-3">
          <Badge tone="active" className="w-fit">Disponible</Badge>
          {canManage && (
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
              <AssignForm vehicleId={vehicleId} />
              <OpenOrderForm vehicleId={vehicleId} title="Enviar a mantenimiento" />
            </div>
          )}
        </div>
      )}

      {status === 'OUT_OF_SERVICE' && (
        <div className="flex flex-col gap-2">
          <Badge tone="critical" className="w-fit">Fuera de servicio</Badge>
          <Detail label="Motivo de la baja" value={decommissionReason} />
        </div>
      )}
    </section>
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
        Abierta el {formatDateTime(order.openedAt)}
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

/** SPEC-0509 CA-5/CA-6: terminar la misión; si va al taller, la avería es obligatoria. */
function EndMissionForm({ vehicleId }: { vehicleId: string }) {
  const { endMission } = useOperationalActions(vehicleId)
  const [note, setNote] = useState('')
  const [odometer, setOdometer] = useState('')
  const [toWorkshop, setToWorkshop] = useState(false)
  const [reason, setReason] = useState('')

  return (
    <form
      className="flex flex-col gap-2 rounded-sm border border-border p-3"
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
        <label className="flex w-40 flex-col gap-1 text-sm text-text-primary">
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

/** SPEC-0509 CA-7: el tipo de misión es obligatorio y sale del catálogo. */
function AssignForm({ vehicleId }: { vehicleId: string }) {
  const { assign } = useOperationalActions(vehicleId)
  const drivers = useAssignableDrivers()
  const types = useMissionTypes()
  const [driverId, setDriverId] = useState('')
  const [missionTypeId, setMissionTypeId] = useState('')
  const [caseReference, setCaseReference] = useState('')
  const [purpose, setPurpose] = useState('')
  const [expectedEnd, setExpectedEnd] = useState('')
  const [caseError, setCaseError] = useState<string | null>(null)

  async function submit() {
    setCaseError(null)
    let caseFileId: string | undefined
    if (caseReference.trim()) {
      try {
        // El caso se escribe por RADICADO, que es lo que una persona conoce.
        const found = await customFetch<{ id?: string }>(`/api/v1/case-files/${encodeURIComponent(caseReference.trim())}`)
        caseFileId = found.id
      } catch {
        setCaseError('No se encontró ese radicado, o su rol no lo alcanza.')
        return
      }
    }
    await assign.mutateAsync({
      driverId,
      missionTypeId,
      ...(caseFileId ? { caseFileId } : {}),
      ...(purpose ? { purpose } : {}),
      ...(expectedEnd ? { expectedEndAt: new Date(expectedEnd).toISOString() } : {}),
    })
  }

  const activeTypes = (types.data ?? []).filter((type) => type.active)

  return (
    <form
      className="flex flex-col gap-2 rounded-sm border border-border p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void submit().catch(() => undefined)
      }}
    >
      <p className="text-sm font-semibold text-text-primary">Asignar a una misión</p>
      <label className="flex flex-col gap-1 text-sm text-text-primary">
        Conductor *
        <select value={driverId} onChange={(event) => setDriverId(event.target.value)} className={SELECT}>
          <option value="">Seleccione…</option>
          {(drivers.data ?? []).map((driver) => (
            <option key={driver.id} value={driver.id}>{driver.displayName}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-primary">
        Tipo de misión *
        <select value={missionTypeId} onChange={(event) => setMissionTypeId(event.target.value)} className={SELECT}>
          <option value="">Seleccione…</option>
          {activeTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
        </select>
        {types.data && activeTypes.length === 0 && (
          <span className="text-xs text-text-secondary">
            No hay tipos de misión. Un administrador puede crearlos desde el inventario.
          </span>
        )}
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-primary">
        Caso vinculado (radicado)
        <Input value={caseReference} placeholder="GAULA-BOG-2026-000004"
               onChange={(event) => setCaseReference(event.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-primary">
        Propósito
        <Input value={purpose} maxLength={500} onChange={(event) => setPurpose(event.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-primary">
        Fin estimado
        <Input type="datetime-local" value={expectedEnd} onChange={(event) => setExpectedEnd(event.target.value)} />
        <span className="text-xs text-text-secondary">Pasada esta fecha sin terminar, el inventario la señala como vencida.</span>
      </label>
      {caseError && <p className="text-sm text-critical">{caseError}</p>}
      {assign.isError && <p className="text-sm text-critical">{errorOf(assign.error, 'No se pudo asignar.')}</p>}
      <div>
        <Button type="submit" variant="primary" size="sm" loading={assign.isPending}
                disabled={!driverId || !missionTypeId}>
          Asignar vehículo
        </Button>
      </div>
    </form>
  )
}

/** SPEC-0509 CA-1: abrir una orden pone el vehículo en mantenimiento. */
function OpenOrderForm({ vehicleId, title }: { vehicleId: string; title: string }) {
  const { openOrder } = useOperationalActions(vehicleId)
  const [orderType, setOrderType] = useState<'PREVENTIVE' | 'CORRECTIVE'>('PREVENTIVE')
  const [description, setDescription] = useState('')
  const [expectedExit, setExpectedExit] = useState('')

  return (
    <form
      className="flex flex-col gap-2 rounded-sm border border-border p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void openOrder.mutateAsync({ orderType, description, ...(expectedExit ? { expectedExitAt: toInstant(expectedExit) ?? '' } : {}) })
          .then(() => { setDescription(''); setExpectedExit('') })
          .catch(() => undefined)
      }}
    >
      <p className="text-sm font-semibold text-text-primary">{title}</p>
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
      <label className="flex flex-col gap-1 text-sm text-text-primary">
        Salida estimada
        <Input type="datetime-local" value={expectedExit} onChange={(event) => setExpectedExit(event.target.value)} />
      </label>
      {openOrder.isError && <p className="text-sm text-critical">{errorOf(openOrder.error, 'No se pudo abrir la orden.')}</p>}
      <div>
        <Button type="submit" variant="secondary" size="sm" loading={openOrder.isPending}
                disabled={description.trim() === ''}>
          Abrir orden
        </Button>
      </div>
    </form>
  )
}

export type { VehicleStatus }
