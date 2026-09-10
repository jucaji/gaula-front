import { MOVEMENT_STYLE } from '@/design-system/maps/FleetMapPort'
import type { FleetPosition, MovementState } from '@/lib/telemetry/types'

const ORDER: MovementState[] = ['MOVING', 'STOPPED', 'NO_SIGNAL', 'UNDETERMINED', 'NEVER_REPORTED']

/**
 * El estado de la flota de un vistazo.
 *
 * Los cinco recuentos van SIEMPRE, incluso en cero. Ocultar «sin señal: 0»
 * ahorraría un recuadro y costaría la información de que ese recuento existe y
 * hoy está bien -- y un operador que no ve la casilla no sabe si está en cero o
 * si el sistema no la mide.
 */
export function FleetSummary({
  positions,
  activeFilter,
  onFilter,
}: {
  positions: FleetPosition[]
  activeFilter: MovementState | null
  onFilter: (state: MovementState | null) => void
}) {
  const counts = ORDER.map((state) => ({
    state,
    count: positions.filter((position) => position.state === state).length,
  }))

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Estado de la flota">
      <button
        type="button"
        onClick={() => onFilter(null)}
        aria-pressed={activeFilter === null}
        className={`flex min-h-[var(--tap-min)] flex-col rounded-sm border px-3 py-1.5 text-left transition-colors ${
          activeFilter === null
            ? 'border-accent bg-accent-subtle'
            : 'border-border bg-surface hover:bg-surface-raised'
        }`}
      >
        <span className="text-lg font-semibold tabular-nums text-text-primary">{positions.length}</span>
        <span className="text-xs text-text-secondary">Toda la flota</span>
      </button>

      {counts.map(({ state, count }) => (
        <button
          key={state}
          type="button"
          onClick={() => onFilter(activeFilter === state ? null : state)}
          aria-pressed={activeFilter === state}
          title={MOVEMENT_STYLE[state].description}
          className={`flex min-h-[var(--tap-min)] flex-col rounded-sm border px-3 py-1.5 text-left transition-colors ${
            activeFilter === state
              ? 'border-accent bg-accent-subtle'
              : 'border-border bg-surface hover:bg-surface-raised'
          }`}
        >
          <span className="text-lg font-semibold tabular-nums text-text-primary">{count}</span>
          <span className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span
              aria-hidden="true"
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: MOVEMENT_STYLE[state].fill }}
            />
            {MOVEMENT_STYLE[state].label}
          </span>
        </button>
      ))}
    </div>
  )
}
