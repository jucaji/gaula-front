import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/design-system/primitives/Button'
import { Spinner } from '@/design-system/primitives/Spinner'
import { TelemetryField, UnavailableNote } from './TelemetryField'
import { VehicleStateChip } from './VehicleStateChip'
import { formatAgeSeconds, formatDateTime } from '@/lib/format/formatDateTime'
import type { VehicleTelemetryResponse } from '@/lib/telemetry/types'

/**
 * Todo lo que se sabe del vehículo seleccionado.
 *
 * Está organizado por la pregunta que responde -- dónde está, cómo va, de dónde
 * sale el dato -- y no por el orden en que el backend devuelve los campos.
 */
export function VehicleDetailsPanel({
  label,
  data,
  isLoading,
  isError,
  onClose,
  onShowTrips,
}: {
  label: string
  data: VehicleTelemetryResponse | undefined
  isLoading: boolean
  isError: boolean
  onClose: () => void
  onShowTrips: () => void
}) {
  return (
    <section
      className="flex h-full flex-col overflow-y-auto border-t border-border bg-surface md:border-l md:border-t-0"
      aria-label={`Detalle de ${label}`}
    >
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-mono text-base font-semibold text-text-primary">{label}</h2>
          {data && <VehicleStateChip state={data.movement.state} />}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar el detalle">
          <X size={16} aria-hidden="true" />
        </Button>
      </header>

      {isLoading && (
        <p className="flex items-center gap-2 p-4 text-sm text-text-secondary">
          <Spinner size={14} label="Cargando la telemetría del vehículo" />
          Cargando…
        </p>
      )}
      {isError && <p className="p-4 text-sm text-critical">No se pudo cargar la telemetría de este vehículo.</p>}

      {data && (
        <div className="flex flex-col gap-5 p-4">
          {data.simulated && (
            <p className="flex items-start gap-2 rounded-sm border border-alert bg-surface-sunken p-2 text-xs text-text-primary">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-alert" aria-hidden="true" />
              <span>
                Estos datos los genera el <strong>simulador</strong>. No corresponden a un vehículo real y
                no deben usarse para decidir nada.
              </span>
            </p>
          )}

          <Section title="Estado">
            <dl className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-text-muted">Por qué</dt>
                <dd className="text-sm text-text-primary">{REASON_LABEL[data.movement.reason] ?? data.movement.reason}</dd>
              </div>
              <TelemetryField
                label="Velocidad"
                value={data.movement.speedKph}
                unit="km/h"
                render={(value) => value.toLocaleString('es-CO', { maximumFractionDigits: 1 })}
              />
              {data.movement.speedSource === 'DERIVED' && (
                <p className="col-span-2 text-xs text-text-secondary">
                  Esta velocidad la <strong>calculamos</strong> entre dos posiciones; el equipo no la
                  reporta. Es un promedio del tramo, no la velocidad instantánea.
                </p>
              )}
            </dl>
          </Section>

          <Section title="Ubicación">
            {data.lastFix ? (
              <dl className="grid grid-cols-2 gap-3">
                <div className="col-span-2 flex flex-col gap-0.5">
                  <dt className="text-xs text-text-muted">Coordenadas</dt>
                  <dd className="font-mono text-sm tabular-nums text-text-primary">
                    {data.lastFix.latitude.toFixed(5)}, {data.lastFix.longitude.toFixed(5)}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-text-muted">Última posición</dt>
                  <dd className={`text-sm ${data.movement.stale ? 'text-alert' : 'text-text-primary'}`}>
                    {formatAgeSeconds(data.movement.ageSeconds)}
                    <span className="block text-xs text-text-muted">
                      {formatDateTime(data.lastFix.recordedAt)}
                    </span>
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-text-muted">Nos llegó</dt>
                  <dd className="text-sm text-text-primary">
                    {formatDateTime(data.lastFix.receivedAt)}
                    {data.lastFix.transportLagSeconds > 60 && (
                      // Un retraso grande no es un error: es cobertura
                      // intermitente, y decirlo evita que alguien lo
                      // interprete como que el sistema va lento.
                      <span className="block text-xs text-text-muted">
                        Tardó {Math.round(data.lastFix.transportLagSeconds / 60)} min en llegar
                      </span>
                    )}
                  </dd>
                </div>
                <TelemetryField
                  label="Rumbo"
                  value={data.lastFix.headingDegrees}
                  unit="°"
                  render={(value) => String(value)}
                />
                <TelemetryField
                  label="Precisión"
                  value={data.lastFix.accuracyMeters}
                  unit="m"
                  render={(value) => value.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                />
              </dl>
            ) : (
              <p className="text-sm text-text-secondary">
                Este vehículo no tiene ninguna posición registrada.
              </p>
            )}
          </Section>

          <Section title="Telemetría del equipo">
            <dl className="grid grid-cols-2 gap-3">
              <TelemetryField
                label="Contacto"
                value={data.lastFix?.ignitionOn ?? { value: null, availability: 'UNKNOWN' }}
                render={(value) => (value ? 'Encendido' : 'Apagado')}
              />
              <TelemetryField
                label="Odómetro"
                value={data.lastFix?.odometerKm ?? { value: null, availability: 'UNKNOWN' }}
                unit="km"
                render={(value) => value.toLocaleString('es-CO')}
              />
              <TelemetryField
                label="Altitud"
                value={data.lastFix?.altitudeMeters ?? { value: null, availability: 'UNKNOWN' }}
                unit="m"
                render={(value) => value.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
              />
            </dl>
          </Section>

          <Section title="Procedencia del dato">
            <dl className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-text-muted">Proveedor</dt>
                <dd className="text-sm text-text-primary">
                  {data.providerCode ?? <UnavailableNote availability="NOT_AVAILABLE" />}
                </dd>
              </div>
              <TelemetryField
                label="Reporta cada"
                value={data.capabilities.nominalIntervalSeconds}
                unit="s"
                render={(value) => String(value)}
              />
            </dl>
            <ProviderGaps capabilities={data.capabilities} />
          </Section>

          <Button variant="secondary" size="md" onClick={onShowTrips}>
            Ver recorridos
          </Button>
          <p className="text-xs text-text-muted">
            Consultar recorridos e historial <strong>queda registrado</strong> en la auditoría del
            sistema.
          </p>
        </div>
      )}
    </section>
  )
}

/**
 * Lo que este proveedor NO entrega, dicho una vez y en su sitio.
 *
 * Sin esto, un panel con tres campos en «sin dato» parece un sistema roto. Con
 * esto, es un proveedor que entrega menos de lo que quisiéramos — que es un
 * hecho del contrato, no un fallo del software (SPEC-0506 CA-14).
 */
function ProviderGaps({ capabilities }: { capabilities: VehicleTelemetryResponse['capabilities'] }) {
  const notProvided = Object.entries(capabilities.fields)
    .filter(([, support]) => support === 'NOT_PROVIDED')
    .map(([field]) => FIELD_LABEL[field] ?? field)

  const unknown = Object.entries(capabilities.fields).filter(([, support]) => support === 'UNKNOWN').length

  if (notProvided.length === 0 && unknown === 0) return null

  return (
    <div className="mt-3 flex flex-col gap-1 rounded-sm border border-border bg-surface-sunken p-2">
      {notProvided.length > 0 && (
        <p className="text-xs text-text-secondary">
          Este proveedor <strong>no entrega</strong>: {notProvided.join(', ')}.
        </p>
      )}
      {unknown > 0 && (
        <p className="text-xs text-text-muted">
          De {unknown} campo{unknown === 1 ? '' : 's'} más no sabemos todavía si los entrega.
        </p>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
      {children}
    </section>
  )
}

const FIELD_LABEL: Record<string, string> = {
  SPEED: 'velocidad',
  HEADING: 'rumbo',
  ALTITUDE: 'altitud',
  ACCURACY: 'precisión',
  IGNITION: 'contacto',
  ODOMETER: 'odómetro',
  SATELLITES: 'satélites',
  BATTERY: 'batería',
  PANIC: 'botón de pánico',
  HARSH_EVENT: 'eventos de conducción',
}

const REASON_LABEL: Record<string, string> = {
  NO_DEVICE_ENROLLED: 'No tiene equipo GPS inscrito',
  NO_FIX_RECEIVED: 'Tiene equipo, pero nunca llegó una primera posición',
  SIGNAL_LOST: 'Dejó de reportar hace más de lo esperado',
  IGNITION_OFF: 'El contacto está apagado',
  REPORTED_SPEED_ABOVE_THRESHOLD: 'El equipo reporta velocidad de marcha',
  REPORTED_SPEED_BELOW_THRESHOLD: 'El equipo reporta una velocidad por debajo del umbral',
  DERIVED_SPEED_ABOVE_THRESHOLD: 'Se desplazó entre dos posiciones',
  DERIVED_SPEED_BELOW_THRESHOLD: 'Apenas se desplazó entre dos posiciones',
  DERIVED_BELOW_JITTER: 'Se movió menos que el error de medición del GPS',
  DERIVATION_WINDOW_TOO_SHORT: 'Las dos últimas posiciones están demasiado juntas para calcular',
  NO_SPEED_AND_NO_PRIOR_FIX: 'El proveedor no entrega velocidad y no hay posición anterior con la que calcularla',
}
