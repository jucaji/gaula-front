import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { customFetch } from '@/api/client'
import { EmptyState } from '@/design-system/patterns/EmptyState'
import { Badge } from '@/design-system/primitives/Badge'
import { MOVEMENT_STYLE } from '@/design-system/maps/FleetMapPort'
import { formatAgeSeconds, formatDateTime } from '@/lib/format/formatDateTime'
import { REASON_LABEL, type VehicleTelemetryResponse } from '@/lib/telemetry/types'

/**
 * SPEC-0508 CA-7/CA-8: dónde está el vehículo, dentro de su propia ficha.
 *
 * <p>Este bloque sólo se monta si el rol alcanza `VEHICLE_TELEMETRY`, y no es
 * un `display:none`: si no lo alcanza, la petición ni siquiera se hace y el
 * backend la denegaría igual. La doctrina de docs/04 §2.4 sigue en pie —la
 * unidad administrativa no ve la operación—; lo que cambia es que un comandante,
 * que alcanza los dos recursos, deja de tener que saltar entre dos consolas.
 */
export function VehicleLocationPanel({ vehicleId }: { vehicleId: string }) {
  const telemetry = useQuery({
    queryKey: ['telemetry', 'vehicles', vehicleId],
    queryFn: () => customFetch<VehicleTelemetryResponse>(`/api/v1/telemetry/vehicles/${vehicleId}`),
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })

  if (telemetry.isLoading) return <p className="text-sm text-text-secondary">Consultando la telemetría…</p>

  // Un vehículo sin inscribir no es un error: la mayoría de la flota puede no
  // tener GPS. Se dice, y se dice qué hacer.
  if (telemetry.isError || !telemetry.data) {
    return (
      <EmptyState
        title="Este vehículo no está inscrito en telemetría"
        description="Registrar un vehículo no lo pone en el mapa: hace falta vincularle un equipo GPS. Un administrador puede hacerlo desde la sección de equipos."
      />
    )
  }

  const data = telemetry.data
  const style = MOVEMENT_STYLE[data.movement.state]
  const fix = data.lastFix

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{style.label}</Badge>
        {data.simulated && <Badge tone="alert">Simulado</Badge>}
      </div>

      <p className="text-sm text-text-secondary">
        {REASON_LABEL[data.movement.reason] ?? style.description}
      </p>

      {fix ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-text-secondary">Última posición</dt>
            <dd className="text-sm text-text-primary">
              {fix.latitude.toFixed(5)}, {fix.longitude.toFixed(5)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">Registrada</dt>
            <dd className="text-sm text-text-primary">{formatDateTime(fix.recordedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">Antigüedad</dt>
            {/* La frescura es información operativa: una posición añeja se
                marca como añeja, nunca se pinta como actual (SPEC-0506 CA-15). */}
            <dd className="text-sm text-text-primary">{formatAgeSeconds(data.movement.ageSeconds)}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-text-muted">Sin ninguna posición registrada todavía.</p>
      )}

      <div>
        <Link to="/flota" search={{ vehiculo: vehicleId, vivo: true }} className="text-sm text-accent-hover underline">
          Ver en el mapa de comando
        </Link>
      </div>
    </div>
  )
}
