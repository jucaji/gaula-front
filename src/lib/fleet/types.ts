/**
 * SPEC-0507 — los tipos de la gestión de flota.
 *
 * <p>A mano y no generados por orval: `contracts/openapi.json` se regenera
 * arrancando el backend, y hasta que eso pase estos tipos son la única
 * descripción del contrato. Cuando el contrato se regenere, esto se sustituye
 * por lo generado — no al revés.
 */

export const VEHICLE_STATUSES = ['AVAILABLE', 'IN_MISSION', 'MAINTENANCE', 'OUT_OF_SERVICE'] as const
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number]

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  AVAILABLE: 'Disponible',
  IN_MISSION: 'En misión',
  MAINTENANCE: 'En mantenimiento',
  OUT_OF_SERVICE: 'Fuera de servicio',
}

export interface Vehicle {
  id: string
  plate: string
  vehicleType: string
  make?: string | null
  model?: string | null
  modelYear?: number | null
  territorialUnitId: string
  status: VehicleStatus
  odometerKm: number
  /** El `If-Match` del PATCH sale de aquí (SPEC-0507 CA-4). */
  version: number
}

export interface TerritorialUnit {
  id: string
  code: string
  name: string
  departmentCode?: string | null
}

export const DEVICE_STATUSES = ['ACTIVE', 'INACTIVE', 'DECOMMISSIONED'] as const
export type DeviceStatus = (typeof DEVICE_STATUSES)[number]

export const DEVICE_STATUS_LABEL: Record<DeviceStatus, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  DECOMMISSIONED: 'Dado de baja',
}

export interface TrackingDevice {
  deviceId: string
  providerCode: string
  externalDeviceId: string
  label?: string | null
  status: DeviceStatus
  installedAt?: string | null
  /** Null significa «equipo libre»: es el que se puede vincular. */
  vehicleId?: string | null
  plate?: string | null
}

export interface VehicleFormValues {
  plate: string
  vehicleType: string
  make: string
  model: string
  modelYear: string
  territorialUnitId: string
}

export const EMPTY_VEHICLE_FORM: VehicleFormValues = {
  plate: '',
  vehicleType: '',
  make: '',
  model: '',
  modelYear: '',
  territorialUnitId: '',
}

/**
 * El año va como texto en el formulario y como número o ausente en el cuerpo.
 *
 * <p>Una cadena vacía convertida con `Number()` da 0, y un cero no es «no hay
 * dato» (regla transversal del proyecto): el backend lo rechazaría por el
 * `@Min(1950)`, y con razón.
 */
export function modelYearOf(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function vehicleToForm(vehicle: Vehicle): VehicleFormValues {
  return {
    plate: vehicle.plate,
    vehicleType: vehicle.vehicleType,
    make: vehicle.make ?? '',
    model: vehicle.model ?? '',
    modelYear: vehicle.modelYear == null ? '' : String(vehicle.modelYear),
    territorialUnitId: vehicle.territorialUnitId,
  }
}

export function describeVehicle(vehicle: Pick<Vehicle, 'make' | 'model' | 'modelYear' | 'vehicleType'>): string {
  return [vehicle.vehicleType, vehicle.make, vehicle.model, vehicle.modelYear].filter(Boolean).join(' ')
}

/** Los campos obligatorios, en un solo sitio: el botón y el envío usan la misma regla. */
export function isVehicleFormComplete(values: VehicleFormValues, mode: 'create' | 'edit'): boolean {
  const base = values.plate.trim() !== '' && values.vehicleType.trim() !== ''
  return mode === 'create' ? base && values.territorialUnitId !== '' : base
}
