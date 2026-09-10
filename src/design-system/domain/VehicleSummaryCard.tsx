import { Badge } from '@/design-system/primitives/Badge'
import { VEHICLE_STATUS_LABEL, type TerritorialUnit, type Vehicle, type VehicleStatus } from '@/lib/fleet/types'

import type { BadgeTone } from '@/design-system/primitives/Badge'

const STATUS_TONE: Record<VehicleStatus, BadgeTone> = {
  AVAILABLE: 'active',
  IN_MISSION: 'alert',
  MAINTENANCE: 'neutral',
  OUT_OF_SERVICE: 'critical',
}

interface Props {
  vehicle: Vehicle
  units: TerritorialUnit[]
  /** Null significa «no se consultó»; false, «consultado y no tiene». Son cosas distintas. */
  hasDevice: boolean | null
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-text-secondary">{label}</dt>
      {/* Un campo vacío se dice, no se deja en blanco: en blanco no se
          distingue de un campo que la pantalla olvidó pintar (docs/06 §8.8). */}
      <dd className={value ? 'text-sm text-text-primary' : 'text-sm text-text-muted'}>
        {value ?? 'Sin registrar'}
      </dd>
    </div>
  )
}

/**
 * SPEC-0508: la tarjeta que faltaba — qué es este vehículo, de un vistazo.
 *
 * <p>Antes había que abrir el formulario de corrección para ver la marca o el
 * modelo, lo que convertía una consulta en un amago de edición.
 */
export function VehicleSummaryCard({ vehicle, units, hasDevice }: Props) {
  const unit = units.find((candidate) => candidate.id === vehicle.territorialUnitId)

  return (
    <section
      // `rounded-md` y borde fuerte: es la superficie de nivel 2 del sistema
      // (docs/06 §4), y la sombra se la aplica `bg-surface-raised` por regla
      // global. En oscuro esa sombra dejó de ser `none` para que la tarjeta se
      // despegue del lienzo — lo pidió el cliente y está argumentado en el
      // token.
      className="rounded-md border border-border-strong bg-surface-raised p-5"
      aria-label="Datos del vehículo"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-text-primary">{vehicle.plate ?? 'Vehículo sin placa'}</h2>
          {vehicle.status && (
            <Badge tone={STATUS_TONE[vehicle.status] ?? 'neutral'}>
              {VEHICLE_STATUS_LABEL[vehicle.status] ?? vehicle.status}
            </Badge>
          )}
        </div>
        {hasDevice === null ? null : (
          <Badge tone={hasDevice ? 'active' : 'neutral'}>{hasDevice ? 'Con GPS' : 'Sin GPS'}</Badge>
        )}
      </div>

      {/* Hasta seis columnas en pantallas anchas: son seis datos cortos, y en
          tres columnas dejaban una franja vacía a la derecha. */}
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 xl:grid-cols-6">
        <Field label="Tipo" value={vehicle.vehicleType ?? null} />
        <Field label="Marca" value={vehicle.make ?? null} />
        <Field label="Modelo" value={vehicle.model ?? null} />
        <Field label="Año" value={vehicle.modelYear ? String(vehicle.modelYear) : null} />
        {/* Defensivo a propósito: la tarjeta se dibuja con lo que el backend
            mandó, y un campo que no llegó se dice — nunca revienta la pantalla
            entera. Lo descubrió la barrida responsive con una respuesta parcial. */}
        <Field
          label="Odómetro"
          value={typeof vehicle.odometerKm === 'number' ? `${vehicle.odometerKm.toLocaleString('es-CO')} km` : null}
        />
        <Field label="Unidad territorial" value={unit ? `${unit.name} (${unit.code})` : null} />
      </dl>
    </section>
  )
}
