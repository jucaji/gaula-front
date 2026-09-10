import { AlertTriangle } from 'lucide-react'
import { VehicleStateChip } from './VehicleStateChip'
import { formatAgeSeconds } from '@/lib/format/formatDateTime'
import type { FleetPosition } from '@/lib/telemetry/types'

/**
 * La lista de vehículos, a la izquierda del mapa.
 *
 * Cada fila lleva la ANTIGÜEDAD de su posición, no la hora absoluta. «hace 12
 * segundos» y «hace 18 minutos» son decisiones operativas distintas, y esa
 * diferencia es exactamente lo que una marca de tiempo absoluta obliga a
 * calcular mentalmente (SPEC-0506 CA-15).
 */
export function VehicleList({
  positions,
  selectedVehicleId,
  onSelect,
  labelFor,
}: {
  positions: FleetPosition[]
  selectedVehicleId: string | null
  onSelect: (vehicleId: string) => void
  labelFor: (vehicleId: string) => string
}) {
  return (
    <ul className="flex flex-col" aria-label="Vehículos">
      {positions.map((position) => (
        <li key={position.vehicleId}>
          <button
            type="button"
            onClick={() => onSelect(position.vehicleId)}
            aria-current={position.vehicleId === selectedVehicleId ? 'true' : undefined}
            className={`flex min-h-[var(--tap-min)] w-full flex-col gap-0.5 border-b border-border px-3 py-2 text-left transition-colors ${
              position.vehicleId === selectedVehicleId
                ? 'bg-accent-subtle'
                : 'hover:bg-surface-raised'
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm font-medium text-text-primary">
                {labelFor(position.vehicleId)}
              </span>
              {/* El color va en el icono y el texto en tinta legible: `text-alert`
                  sobre `bg-alert/15` no alcanzaba 4.5:1 y axe lo detectó (docs/06 §9). */}
              {position.simulated && (
                <span
                  className="inline-flex items-center gap-1 rounded-sm border border-alert bg-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-primary"
                  title="Dato generado por el simulador: no corresponde a un vehículo real."
                >
                  <AlertTriangle size={10} aria-hidden="true" />
                  Simulado
                </span>
              )}
            </span>
            <VehicleStateChip state={position.state} />
            <span className={`text-xs ${position.stale ? 'text-alert' : 'text-text-muted'}`}>
              {position.recordedAt
                ? formatAgeSeconds(position.ageSeconds)
                : 'Sin ninguna posición registrada'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
