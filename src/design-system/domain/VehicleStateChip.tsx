import { ArrowUpRight, Circle, CircleDashed, HelpCircle, XCircle } from 'lucide-react'
import { MOVEMENT_STYLE } from '@/design-system/maps/FleetMapPort'
import type { MovementState } from '@/lib/telemetry/types'

const ICON: Record<MovementState, typeof Circle> = {
  MOVING: ArrowUpRight,
  STOPPED: Circle,
  NO_SIGNAL: CircleDashed,
  NEVER_REPORTED: XCircle,
  UNDETERMINED: HelpCircle,
}

const TONE: Record<MovementState, string> = {
  MOVING: 'text-stable',
  STOPPED: 'text-active',
  NO_SIGNAL: 'text-alert',
  NEVER_REPORTED: 'text-text-muted',
  UNDETERMINED: 'text-critical',
}

/**
 * El estado de movimiento de un vehículo.
 *
 * Icono + texto, nunca color solo (docs/06 §4.4): quien lee esto puede ser
 * daltónico y estar decidiendo a qué vehículo mandar a una operación.
 *
 * Los cinco estados son cinco, no tres. `NEVER_REPORTED` y `NO_SIGNAL` se ven
 * distintos porque ante uno se pide instalar el equipo y ante el otro se manda
 * a alguien a buscar el vehículo (SPEC-0506 CA-2). Y `UNDETERMINED` existe para
 * no tener que mentir cuando el proveedor no entrega con qué decidir (CA-3).
 */
export function VehicleStateChip({ state, compact = false }: { state: MovementState; compact?: boolean }) {
  const Icon = ICON[state]
  const style = MOVEMENT_STYLE[state]

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${TONE[state]}`}
      title={style.description}
    >
      <Icon size={13} aria-hidden="true" strokeWidth={2.5} />
      {!compact && <span>{style.label}</span>}
      <span className="sr-only">{style.description}</span>
    </span>
  )
}
