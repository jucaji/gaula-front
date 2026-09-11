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
  /** SPEC-0509: por qué requiere mirarse (misión o mantenimiento vencidos), o nada. */
  attention?: string | null
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

// --- SPEC-0508: la historia del vehículo ---

export const EFFICIENCY_STATUSES = ['CALCULATED', 'NO_PREVIOUS_LOAD', 'ODOMETER_DID_NOT_ADVANCE'] as const
export type EfficiencyStatus = (typeof EFFICIENCY_STATUSES)[number]

/**
 * Cómo se lee un rendimiento que no se pudo calcular.
 *
 * <p>Cada caso dice POR QUÉ, y ninguno dice «0». Un cero afirmaría que el
 * vehículo recorrió 0 km con esos litros — una afirmación fuerte y casi siempre
 * falsa (misma regla que en telemetría: un cero no es «no hay dato»).
 */
export const EFFICIENCY_EXPLANATION: Record<Exclude<EfficiencyStatus, 'CALCULATED'>, string> = {
  NO_PREVIOUS_LOAD: 'Primera carga registrada: todavía no hay un tramo con el que compararla.',
  ODOMETER_DID_NOT_ADVANCE:
    'El odómetro no avanzó entre esta carga y la anterior. O se registró mal, o el vehículo tanqueó dos veces sin moverse.',
}

export interface FuelRecord {
  id: string
  loadedAt: string
  liters: number
  cost?: number | null
  odometerKm: number
  efficiencyStatus: EfficiencyStatus
  kilometersPerLiter?: number | null
  distanceKm: number
}

export interface FuelHistory {
  records: FuelRecord[]
  averageKmPerLiter?: number | null
  calculableTramos: number
  loadsWithoutCost: number
}

export const MAINTENANCE_TYPE_LABEL: Record<string, string> = {
  PREVENTIVE: 'Preventivo',
  CORRECTIVE: 'Correctivo',
}

export const MAINTENANCE_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Abierta',
  CLOSED: 'Cerrada',
}

export interface MaintenanceOrder {
  id: string
  vehicleId: string
  orderType: string
  status: string
  description: string
  cost?: number | null
  openedAt: string
  closedAt?: string | null
}

export interface VehicleAssignmentRecord {
  id: string
  vehicleId: string
  caseFileId?: string | null
  driverId: string
  assignedFrom: string
  assignedTo?: string | null
  purpose?: string | null
}

export interface VehicleEvent {
  id: string
  type: string
  occurredAt: string
  actorId?: string | null
  summary: string
  details: Record<string, string>
}

/**
 * Cómo se nombra cada hecho en pantalla.
 *
 * <p>El RESUMEN lo redacta el servidor; esta etiqueta es la del tipo, y sin ella
 * la línea de tiempo mostraba `FUEL_RECORDED` en mayúsculas y en inglés — el
 * vocabulario interno asomando en la cara del usuario.
 */
export const EVENT_TYPE_LABEL: Record<string, string> = {
  REGISTERED: 'Alta',
  CORRECTED: 'Corrección',
  TRANSFERRED: 'Traslado',
  DECOMMISSIONED: 'Baja',
  RETURNED_TO_SERVICE: 'Reactivación',
  ASSIGNED: 'Asignación',
  RELEASED: 'Liberación',
  FUEL_RECORDED: 'Combustible',
  MAINTENANCE_OPENED: 'Mantenimiento',
  MAINTENANCE_CLOSED: 'Mantenimiento',
}

/** El tono de cada hecho. El texto lo redacta el servidor; aquí sólo se le da forma. */
export const EVENT_TONE: Record<string, 'neutral' | 'active' | 'alert' | 'critical'> = {
  REGISTERED: 'active',
  CORRECTED: 'neutral',
  TRANSFERRED: 'alert',
  DECOMMISSIONED: 'critical',
  RETURNED_TO_SERVICE: 'active',
  ASSIGNED: 'active',
  RELEASED: 'neutral',
  FUEL_RECORDED: 'neutral',
  MAINTENANCE_OPENED: 'alert',
  MAINTENANCE_CLOSED: 'neutral',
}

/** Quién puede conducir: lo mínimo para reconocer a alguien en una lista (SPEC-0508 bis). */
export interface Driver {
  id: string
  displayName: string
  rank?: string | null
}

// --- SPEC-0509: estados operativos ---

/** Un tipo de misión del catálogo que gobierna el cliente. `active` false = archivado. */
export interface MissionType {
  id: string
  name: string
  description?: string | null
  active: boolean
}

export interface CurrentMission {
  assignmentId: string
  driverId: string
  driverName?: string | null
  missionTypeName?: string | null
  caseTrackingNumber?: string | null
  purpose?: string | null
  since: string
  expectedEndAt?: string | null
  overdue: boolean
}

export interface OpenOrder {
  orderId: string
  orderType: string
  description: string
  openedAt: string
  expectedExitAt?: string | null
  cost?: number | null
  overdue: boolean
}

/**
 * El porqué del estado de un vehículo (SPEC-0509 Decisión 4).
 *
 * <p>Sólo viaja lo que corresponde al estado: `mission` vacío si no está en
 * misión, `openOrders` vacío si no está en el taller.
 */
export interface VehicleSituation {
  vehicleId: string
  status: VehicleStatus
  mission?: CurrentMission | null
  openOrders: OpenOrder[]
  decommissionReason?: string | null
}

/** Por qué un vehículo requiere mirarse en el inventario. */
export const ATTENTION_LABEL: Record<string, string> = {
  MISSION_OVERDUE: 'Misión vencida',
  MAINTENANCE_OVERDUE: 'Mantenimiento vencido',
}
