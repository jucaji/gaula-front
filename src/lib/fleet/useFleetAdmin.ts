import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { customFetch } from '@/api/client'
import type {
  Driver,
  FuelHistory,
  MaintenanceOrder,
  TerritorialUnit,
  TrackingDevice,
  Vehicle,
  VehicleAssignmentRecord,
  VehicleEvent,
  VehicleFormValues,
} from './types'
import { modelYearOf } from './types'

interface Page<T> {
  content?: T[]
  totalElements?: number
}

/** El catálogo que evita teclear un UUID de unidad territorial (SPEC-0507). */
export function useTerritorialUnits() {
  return useQuery({
    queryKey: ['iam', 'territorial-units'],
    queryFn: () => customFetch<TerritorialUnit[]>('/api/v1/territorial-units'),
    // Las unidades territoriales del país cambian de año en año, no de minuto
    // en minuto: pedirlas en cada apertura del formulario sería ruido.
    staleTime: 30 * 60_000,
    networkMode: 'always',
    retry: false,
  })
}

export function useVehicle(vehicleId: string) {
  return useQuery({
    queryKey: ['resource', 'vehicles', vehicleId],
    queryFn: () => customFetch<Vehicle>(`/api/v1/vehicles/${vehicleId}`),
    networkMode: 'always',
    retry: false,
  })
}

export function useDevices(enabled = true) {
  return useQuery({
    queryKey: ['telemetry', 'devices'],
    queryFn: () => customFetch<Page<TrackingDevice>>('/api/v1/telemetry/devices?page=0&size=100'),
    // Sin permiso de equipos, la consulta ni se intenta: el backend devolvería
    // 403 y la consola pintaría un error por preguntar algo que ya sabía.
    enabled,
    networkMode: 'always',
    retry: false,
  })
}

function bodyOf(values: VehicleFormValues) {
  return {
    plate: values.plate.trim(),
    vehicleType: values.vehicleType.trim(),
    make: values.make.trim() || undefined,
    model: values.model.trim() || undefined,
    modelYear: modelYearOf(values.modelYear),
  }
}

/**
 * Las mutaciones de flota, con la invalidación en un solo sitio.
 *
 * <p>Se invalida la lista Y la ficha: tras un traslado, la lista del comandante
 * de origen tiene que dejar de mostrarlo. Invalidar sólo la ficha dejaría la
 * pantalla anterior mintiendo hasta el siguiente refresco.
 */
export function useFleetMutations(vehicleId?: string) {
  const queryClient = useQueryClient()

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['resource', 'vehicles'] })
    await queryClient.invalidateQueries({ queryKey: ['telemetry'] })
  }

  const register = useMutation({
    mutationFn: (values: VehicleFormValues) =>
      customFetch<Vehicle>('/api/v1/vehicles', {
        method: 'POST',
        body: JSON.stringify({ ...bodyOf(values), territorialUnitId: values.territorialUnitId }),
      }),
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: ({ values, version }: { values: VehicleFormValues; version: number }) =>
      customFetch<Vehicle>(`/api/v1/vehicles/${vehicleId}`, {
        // PUT: el cuerpo reemplaza el bloque de características completo, y el
        // formulario siempre lo manda entero. Un PATCH prometería cambios
        // parciales que este endpoint no hace.
        method: 'PUT',
        // CA-4: la versión que ESTE actor tiene en pantalla, no una recién
        // leída del servidor -- releerla convertiría el control de concurrencia
        // en una formalidad que siempre pasa.
        headers: { 'If-Match': `"${version}"` },
        body: JSON.stringify(bodyOf(values)),
      }),
    onSuccess: invalidate,
  })

  const transfer = useMutation({
    mutationFn: ({ targetTerritorialUnitId, reason }: { targetTerritorialUnitId: string; reason?: string }) =>
      customFetch<Vehicle>(`/api/v1/vehicles/${vehicleId}/transfer`, {
        method: 'POST',
        body: JSON.stringify({ targetTerritorialUnitId, reason: reason?.trim() || undefined }),
      }),
    onSuccess: invalidate,
  })

  const decommission = useMutation({
    mutationFn: (reason?: string) =>
      customFetch<Vehicle>(`/api/v1/vehicles/${vehicleId}/decommission`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason?.trim() || undefined }),
      }),
    onSuccess: invalidate,
  })

  const returnToService = useMutation({
    mutationFn: () =>
      customFetch<Vehicle>(`/api/v1/vehicles/${vehicleId}/return-to-service`, { method: 'POST' }),
    onSuccess: invalidate,
  })

  return { register, update, transfer, decommission, returnToService }
}

export function useDeviceMutations() {
  const queryClient = useQueryClient()

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['telemetry'] })
    await queryClient.invalidateQueries({ queryKey: ['resource', 'vehicles'] })
  }

  const registerDevice = useMutation({
    mutationFn: (input: { providerCode: string; externalDeviceId: string; label?: string }) =>
      customFetch<{ deviceId: string }>('/api/v1/telemetry/devices', {
        method: 'POST',
        body: JSON.stringify({
          providerCode: input.providerCode.trim(),
          externalDeviceId: input.externalDeviceId.trim(),
          label: input.label?.trim() || undefined,
          installedAt: new Date().toISOString(),
        }),
      }),
    onSuccess: invalidate,
  })

  const renameDevice = useMutation({
    mutationFn: ({ deviceId, label }: { deviceId: string; label: string }) =>
      customFetch(`/api/v1/telemetry/devices/${deviceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ label: label.trim() }),
      }),
    onSuccess: invalidate,
  })

  const decommissionDevice = useMutation({
    mutationFn: (deviceId: string) =>
      customFetch(`/api/v1/telemetry/devices/${deviceId}/decommission`, { method: 'POST' }),
    onSuccess: invalidate,
  })

  const enroll = useMutation({
    mutationFn: ({ vehicleId, deviceId }: { vehicleId: string; deviceId: string }) =>
      customFetch(`/api/v1/telemetry/vehicles/${vehicleId}/enroll`, {
        method: 'POST',
        body: JSON.stringify({ deviceId }),
      }),
    onSuccess: invalidate,
  })

  const withdraw = useMutation({
    mutationFn: (vehicleId: string) =>
      customFetch(`/api/v1/telemetry/vehicles/${vehicleId}/withdraw`, { method: 'POST' }),
    onSuccess: invalidate,
  })

  return { registerDevice, renameDevice, decommissionDevice, enroll, withdraw }
}

// --- SPEC-0508: la historia del vehículo ---

/**
 * Las cuatro consultas de historia comparten `staleTime`: son hechos pasados,
 * no un tablero en vivo. Refrescarlas cada pocos segundos sólo gastaría red.
 */
const HISTORY_OPTIONS = { staleTime: 30_000, networkMode: 'always', retry: false } as const

export function useFuelHistory(vehicleId: string, enabled = true) {
  return useQuery({
    queryKey: ['resource', 'vehicles', vehicleId, 'fuel'],
    queryFn: () => customFetch<FuelHistory>(`/api/v1/vehicles/${vehicleId}/fuel`),
    enabled,
    ...HISTORY_OPTIONS,
  })
}

export function useMaintenanceOrders(vehicleId: string, enabled = true) {
  return useQuery({
    queryKey: ['resource', 'vehicles', vehicleId, 'maintenance'],
    queryFn: () => customFetch<MaintenanceOrder[]>(`/api/v1/vehicles/${vehicleId}/maintenance-orders`),
    enabled,
    ...HISTORY_OPTIONS,
  })
}

export function useAssignmentHistory(vehicleId: string, enabled = true) {
  return useQuery({
    queryKey: ['resource', 'vehicles', vehicleId, 'assignments'],
    queryFn: () => customFetch<VehicleAssignmentRecord[]>(`/api/v1/vehicles/${vehicleId}/assignments`),
    enabled,
    ...HISTORY_OPTIONS,
  })
}

export function useVehicleEvents(vehicleId: string, enabled = true) {
  return useQuery({
    queryKey: ['resource', 'vehicles', vehicleId, 'events'],
    queryFn: () =>
      customFetch<{ content?: VehicleEvent[]; totalElements?: number }>(
        `/api/v1/vehicles/${vehicleId}/events?page=0&size=50`,
      ),
    enabled,
    ...HISTORY_OPTIONS,
  })
}

/**
 * Las personas a las que se les puede asignar este vehículo.
 *
 * <p>El backend devuelve SIEMPRE la unidad territorial de quien pregunta, así
 * que no hay parámetro que ajustar — ni forma de pedir el personal de otra
 * unidad. A quien no puede asignar le llega una lista vacía, y la consola lo
 * dice en vez de mostrar un desplegable vacío sin explicación.
 */
export function useAssignableDrivers(enabled = true) {
  return useQuery({
    queryKey: ['resource', 'assignable-drivers'],
    queryFn: () => customFetch<Driver[]>('/api/v1/vehicles/assignable-drivers'),
    enabled,
    staleTime: 5 * 60_000,
    networkMode: 'always',
    retry: false,
  })
}
