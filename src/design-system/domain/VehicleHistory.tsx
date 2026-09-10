import { Badge } from '@/design-system/primitives/Badge'
import { EmptyState } from '@/design-system/patterns/EmptyState'
import { formatDateTime } from '@/lib/format/formatDateTime'
import {
  EFFICIENCY_EXPLANATION,
  EVENT_TONE,
  EVENT_TYPE_LABEL,
  MAINTENANCE_STATUS_LABEL,
  MAINTENANCE_TYPE_LABEL,
  type FuelHistory,
  type MaintenanceOrder,
  type VehicleAssignmentRecord,
  type VehicleEvent,
} from '@/lib/fleet/types'

const CARD = 'rounded-md border border-border-strong bg-surface-raised p-3'

function money(value?: number | null): string {
  return value == null ? 'Sin costo registrado' : value.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}

/**
 * SPEC-0508 CA-2/CA-3: el combustible, con el rendimiento del tramo.
 *
 * <p>Un tramo sin rendimiento NO muestra cero: muestra por qué no se pudo
 * calcular. Es la misma regla que en telemetría — un cero es una afirmación, y
 * aquí sería falsa.
 */
export function FuelHistoryPanel({ history }: { history: FuelHistory }) {
  if (history.records.length === 0) {
    return (
      <EmptyState
        title="Sin tanqueos registrados"
        description="Cuando se registre el primer tanqueo aparecerá aquí, con los kilómetros y el costo."
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={`${CARD} flex flex-wrap gap-6`}>
        <div>
          <p className="text-xs text-text-secondary">Rendimiento del período</p>
          {history.averageKmPerLiter == null ? (
            <>
              <p className="text-sm text-text-muted">Sin dato</p>
              <p className="max-w-sm text-xs text-text-secondary">
                Hace falta al menos un tramo entre dos tanqueos con el odómetro avanzando.
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-text-primary">
                {history.averageKmPerLiter.toLocaleString('es-CO')} km/l
              </p>
              {/* Un promedio sin su denominador no se puede juzgar. */}
              <p className="text-xs text-text-secondary">
                Sobre {history.calculableTramos}{' '}
                {history.calculableTramos === 1 ? 'tramo calculable' : 'tramos calculables'}
              </p>
            </>
          )}
        </div>
        {history.loadsWithoutCost > 0 && (
          <div>
            <p className="text-xs text-text-secondary">Cargas sin costo</p>
            <p className="text-lg font-semibold text-text-primary">{history.loadsWithoutCost}</p>
            <p className="text-xs text-text-secondary">El costo es opcional al registrar.</p>
          </div>
        )}
      </div>

      <ul className="flex flex-col gap-2" aria-label="Tanqueos">
        {history.records.map((record) => (
          <li key={record.id} className={CARD}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-text-primary">
                {record.liters.toLocaleString('es-CO')} litros · {record.odometerKm.toLocaleString('es-CO')} km
              </p>
              <p className="text-xs text-text-secondary">{formatDateTime(record.loadedAt)}</p>
            </div>
            <p className="text-xs text-text-secondary">{money(record.cost)}</p>

            {record.efficiencyStatus === 'CALCULATED' ? (
              <p className="mt-1 text-sm text-text-primary">
                {record.kilometersPerLiter?.toLocaleString('es-CO')} km/l
                <span className="text-text-secondary"> en {record.distanceKm.toLocaleString('es-CO')} km</span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-text-muted">
                Rendimiento sin dato. {EFFICIENCY_EXPLANATION[record.efficiencyStatus]}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function MaintenancePanel({ orders }: { orders: MaintenanceOrder[] }) {
  if (orders.length === 0) {
    return (
      <EmptyState
        title="Sin órdenes de mantenimiento"
        description="Las órdenes abiertas y cerradas de este vehículo aparecerán aquí."
      />
    )
  }

  return (
    <ul className="flex flex-col gap-2" aria-label="Órdenes de mantenimiento">
      {orders.map((order) => (
        <li key={order.id} className={CARD}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-text-primary">{order.description}</p>
            <Badge tone={order.status === 'OPEN' ? 'alert' : 'neutral'}>
              {MAINTENANCE_STATUS_LABEL[order.status] ?? order.status}
            </Badge>
          </div>
          <p className="text-xs text-text-secondary">
            {MAINTENANCE_TYPE_LABEL[order.orderType] ?? order.orderType} · abierta el {formatDateTime(order.openedAt)}
            {order.closedAt ? ` · cerrada el ${formatDateTime(order.closedAt)}` : ''}
          </p>
          <p className="text-xs text-text-secondary">{money(order.cost)}</p>
        </li>
      ))}
    </ul>
  )
}

/** SPEC-0504 CA-5 sigue vigente: viaja el identificador del caso, nunca su contenido. */
export function AssignmentHistoryPanel({ assignments }: { assignments: VehicleAssignmentRecord[] }) {
  if (assignments.length === 0) {
    return (
      <EmptyState
        title="Sin asignaciones"
        description="Este vehículo no ha sido asignado a ninguna operación todavía."
      />
    )
  }

  return (
    <ul className="flex flex-col gap-2" aria-label="Asignaciones">
      {assignments.map((assignment) => (
        <li key={assignment.id} className={CARD}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-text-primary">
              {assignment.purpose || 'Sin propósito registrado'}
            </p>
            <Badge tone={assignment.assignedTo ? 'neutral' : 'active'}>
              {assignment.assignedTo ? 'Terminada' : 'Activa'}
            </Badge>
          </div>
          <p className="text-xs text-text-secondary">
            Desde {formatDateTime(assignment.assignedFrom)}
            {assignment.assignedTo ? ` hasta ${formatDateTime(assignment.assignedTo)}` : ''}
          </p>
          {assignment.caseFileId && (
            <p className="text-xs text-text-secondary">Caso vinculado: {assignment.caseFileId}</p>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * SPEC-0508 CA-12: la línea de tiempo.
 *
 * <p>Dice desde cuándo registra. Sin esa nota, un vehículo antiguo con tres
 * eventos se leería como un vehículo sin historia, y no es lo mismo: es que
 * antes nadie la guardaba.
 */
export function VehicleTimelinePanel({ events }: { events: VehicleEvent[] }) {
  if (events.length === 0) {
    return (
      <EmptyState
        title="Sin hechos registrados"
        description="La línea de tiempo empieza a registrar desde que el módulo la incorporó; lo anterior no quedó guardado."
      />
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-2" aria-label="Línea de tiempo">
        {events.map((event) => (
          <li key={event.id} className={`${CARD} flex flex-wrap items-baseline justify-between gap-2`}>
            <div className="flex items-baseline gap-2">
              <Badge tone={EVENT_TONE[event.type] ?? 'neutral'}>{EVENT_TYPE_LABEL[event.type] ?? event.type}</Badge>
              <p className="text-sm text-text-primary">{event.summary}</p>
            </div>
            <p className="text-xs text-text-secondary">{formatDateTime(event.occurredAt)}</p>
          </li>
        ))}
      </ol>
      <p className="text-xs text-text-muted">
        La línea de tiempo registra desde que el módulo la incorporó. Lo anterior a esa fecha no quedó guardado.
      </p>
    </div>
  )
}
