import type { FieldAvailability, TelemetryValue } from '@/lib/telemetry/types'

/**
 * Un campo de telemetría en pantalla, con su razón de ausencia.
 *
 * Éste es el componente donde vive todo el sentido de SPEC-0506. Un campo
 * vacío sin explicación es indistinguible de un fallo, y el lector rellena el
 * hueco con lo que supone -- normalmente con un cero. Aquí:
 *
 * - `SUPPORTED` muestra el valor.
 * - `NOT_AVAILABLE` dice «el equipo no lo reportó».
 * - `UNKNOWN` dice «no se sabe si este proveedor lo entrega».
 *
 * Nunca «0», nunca un guion mudo.
 */
export function TelemetryField<T>({
  label,
  value,
  render,
  unit,
}: {
  label: string
  value: TelemetryValue<T>
  render?: (value: T) => string
  unit?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-sm text-text-primary">
        {value.availability === 'SUPPORTED' && value.value !== null ? (
          <span className="tabular-nums">
            {render ? render(value.value) : String(value.value)}
            {unit && <span className="ml-1 text-xs text-text-secondary">{unit}</span>}
          </span>
        ) : (
          <UnavailableNote availability={value.availability} />
        )}
      </dd>
    </div>
  )
}

/**
 * Las dos ausencias, dichas con palabras distintas.
 *
 * Que se distingan no es un lujo: ante «el equipo no lo reportó» un operador
 * espera al siguiente reporte; ante «no se sabe si este proveedor lo entrega»
 * lo que hace falta es preguntarle al proveedor, y eso es trabajo de otra
 * persona.
 */
export function UnavailableNote({ availability }: { availability: FieldAvailability }) {
  if (availability === 'NOT_AVAILABLE') {
    return <span className="text-xs text-text-muted">El equipo no lo reportó</span>
  }
  return <span className="text-xs text-text-muted">Sin dato del proveedor</span>
}
