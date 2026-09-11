/**
 * SPEC-0506. El contrato de telemetría, tipado desde el lado de la consola.
 *
 * Escrito a mano y no generado porque el punto entero del módulo vive en el
 * tipo: `TelemetryValue` obliga a que cada campo opcional viaje con SU RAZÓN de
 * ausencia, y ningún componente pueda leer un hueco como un cero.
 */

/** Por qué un campo tiene o no tiene valor. */
export type FieldAvailability = 'SUPPORTED' | 'NOT_AVAILABLE' | 'UNKNOWN'

/** Lo que un proveedor declara, antes de ver una sola lectura. */
export type FieldSupport = 'PROVIDED' | 'NOT_PROVIDED' | 'UNKNOWN'

/**
 * Un dato de telemetría con su disponibilidad.
 *
 * `value` es `null` salvo cuando `availability === 'SUPPORTED'`. Esa invariante
 * la garantiza la base con dos CHECK por campo, así que aquí se puede confiar
 * en ella -- pero no se puede *ignorar*: leer `value` sin mirar `availability`
 * es exactamente el defecto que este tipo existe para impedir.
 */
export interface TelemetryValue<T> {
  value: T | null
  availability: FieldAvailability
}

/** Si el vehículo se mueve. Derivado, y distinto del estado administrativo. */
export type MovementState =
  | 'MOVING'
  | 'STOPPED'
  | 'NO_SIGNAL'
  /** Nunca reportó: sin equipo, o con equipo y sin primera posición. */
  | 'NEVER_REPORTED'
  /** Hay posición fresca pero no hay criterio para decidir. No es "detenido". */
  | 'UNDETERMINED'

export type SpeedSource = 'REPORTED' | 'DERIVED' | 'NONE'

export type TrackingState = 'ENROLLED' | 'SUSPENDED' | 'WITHDRAWN'

export type TripStatus = 'OPEN' | 'CLOSED' | 'ABANDONED'

export type DistanceSource = 'ODOMETER' | 'DERIVED_FROM_FIXES' | 'NONE'

/**
 * La instantánea de flota, en formato columnar.
 *
 * El backend declara el orden de las columnas en `fields` y el cliente lo lee
 * de ahí, no de una constante propia: así añadir una columna no rompe nada.
 */
export interface FleetSnapshotResponse {
  observedAt: string
  fields: string[]
  rows: unknown[][]
  truncated: boolean
  total: number
}

/** Una fila de la instantánea, ya desempaquetada a objeto. */
export interface FleetPosition {
  vehicleId: string
  /** La placa. Puede faltar si `resource` ya no conoce el vehículo. */
  plate: string | null
  vehicleType: string | null
  territorialUnitId: string
  latitude: number | null
  longitude: number | null
  speedKph: number | null
  speedAvailability: FieldAvailability
  speedSource: SpeedSource
  state: MovementState
  reason: string
  recordedAt: string | null
  ageSeconds: number | null
  stale: boolean
  simulated: boolean
}

export interface ProviderCapabilities {
  fields: Record<string, FieldSupport>
  nominalIntervalSeconds: TelemetryValue<number>
  pushCapable: boolean
  pullCapable: boolean
}

export interface PositionFixResponse {
  vehicleId: string
  latitude: number
  longitude: number
  recordedAt: string
  receivedAt: string
  transportLagSeconds: number
  speedKph: TelemetryValue<number>
  headingDegrees: TelemetryValue<number>
  altitudeMeters: TelemetryValue<number>
  accuracyMeters: TelemetryValue<number>
  ignitionOn: TelemetryValue<boolean>
  odometerKm: TelemetryValue<number>
}

export interface VehicleTelemetryResponse {
  vehicleId: string
  plate: string | null
  trackingState: TrackingState
  providerCode: string | null
  capabilities: ProviderCapabilities
  lastFix: PositionFixResponse | null
  movement: {
    state: MovementState
    reason: string
    speedKph: TelemetryValue<number>
    speedSource: SpeedSource
    observedAt: string | null
    ageSeconds: number | null
    stale: boolean
  }
  simulated: boolean
}

export interface TripResponse {
  id: string
  vehicleId: string
  startedAt: string
  endedAt: string | null
  durationSeconds: number | null
  startLatitude: number
  startLongitude: number
  endLatitude: number | null
  endLongitude: number | null
  distanceMeters: TelemetryValue<number>
  distanceSource: DistanceSource
  maxSpeedKph: TelemetryValue<number>
  fixCount: number
  maxGapSeconds: number
  status: TripStatus
}

export interface ProviderResponse {
  providerCode: string
  displayName: string
  capabilities: ProviderCapabilities
  modes: string[]
  simulated: boolean
}

export interface MapProviderConfig {
  provider: 'GOOGLE' | 'MAPLIBRE'
  apiKey: string | null
  mapId: string | null
  configured: boolean
}

/**
 * Desempaqueta el formato columnar a objetos.
 *
 * Se apoya en `fields` y no en posiciones fijas: el backend puede añadir una
 * columna sin que esto tenga que cambiar el mismo día.
 */
export function unpackFleetSnapshot(snapshot: FleetSnapshotResponse): FleetPosition[] {
  const index = (name: string) => snapshot.fields.indexOf(name)
  const i = {
    vehicleId: index('vehicleId'),
    plate: index('plate'),
    vehicleType: index('vehicleType'),
    territorialUnitId: index('territorialUnitId'),
    lat: index('lat'),
    lon: index('lon'),
    speedKph: index('speedKph'),
    speedAvailability: index('speedAvailability'),
    speedSource: index('speedSource'),
    state: index('state'),
    reason: index('reason'),
    recordedAt: index('recordedAt'),
    ageSeconds: index('ageSeconds'),
    stale: index('stale'),
    simulated: index('simulated'),
  }

  return snapshot.rows.map((row) => ({
    vehicleId: row[i.vehicleId] as string,
    plate: (row[i.plate] as string | null) ?? null,
    vehicleType: (row[i.vehicleType] as string | null) ?? null,
    territorialUnitId: row[i.territorialUnitId] as string,
    latitude: (row[i.lat] as number | null) ?? null,
    longitude: (row[i.lon] as number | null) ?? null,
    speedKph: (row[i.speedKph] as number | null) ?? null,
    speedAvailability: row[i.speedAvailability] as FieldAvailability,
    speedSource: row[i.speedSource] as SpeedSource,
    state: row[i.state] as MovementState,
    reason: row[i.reason] as string,
    recordedAt: (row[i.recordedAt] as string | null) ?? null,
    ageSeconds: (row[i.ageSeconds] as number | null) ?? null,
    stale: Boolean(row[i.stale]),
    simulated: Boolean(row[i.simulated]),
  }))
}

/** Por qué el sistema afirma lo que afirma sobre el movimiento. Vive aquí para que la ficha y la consola lo digan igual. */
export const REASON_LABEL: Record<string, string> = {
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

/**
 * SPEC-0511: la dirección de la última posición, o por qué no la hay. La
 * dirección es la que el proveedor asocia al punto: aproximada, no verificada.
 */
export type AddressStatus = 'RESOLVED' | 'NOT_FOUND' | 'UNAVAILABLE' | 'DISABLED' | 'NO_POSITION'

export interface VehicleAddressResponse {
  vehicleId: string
  status: AddressStatus
  address?: string | null
  provider?: string | null
  detail?: string | null
  fromCache: boolean
  latitude?: number | null
  longitude?: number | null
  resolvedAt?: string | null
  /** A cuántos metros del punto de la dirección está hoy el vehículo (radio de reutilización: 100 m). */
  offsetMeters?: number
}

export const ADDRESS_PROVIDER_LABEL: Record<string, string> = {
  GOOGLE: 'Google',
}

