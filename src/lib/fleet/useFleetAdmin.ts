import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { customFetch } from '@/api/client'
import type {
  AuthorizedDriver,
  CrewInput,
  DriverFormValues,
  DriverOption,
  DriverRecord,
  LinkableUser,
  Mission,
  MissionStatus,
  FuelHistory,
  LinkableCase,
  VehicleMetrics,
  MissionType,
  VehicleSituation,
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


// --- SPEC-0509: estados operativos ---

export function useMissionTypes(enabled = true) {
  return useQuery({
    queryKey: ['resource', 'mission-types'],
    queryFn: () => customFetch<MissionType[]>('/api/v1/mission-types'),
    enabled,
    staleTime: 5 * 60_000,
    networkMode: 'always',
    retry: false,
  })
}

/**
 * El catálogo de tipos de misión (SPEC-0509 Decisión 3).
 *
 * <p>`remove` devuelve lo que pasó de verdad —`DELETED` o `ARCHIVED`—, porque
 * la pantalla tiene que poder decir «se archivó porque lo usan misiones
 * anteriores» en vez de dejar creer que desapareció.
 */
export function useMissionTypeMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['resource', 'mission-types'] })

  const create = useMutation({
    mutationFn: (input: { name: string; description?: string }) =>
      customFetch<MissionType>('/api/v1/mission-types', {
        method: 'POST',
        body: JSON.stringify({ name: input.name.trim(), description: input.description?.trim() || undefined }),
      }),
    onSuccess: invalidate,
  })

  const edit = useMutation({
    mutationFn: (input: { id: string; name: string; description?: string }) =>
      customFetch<MissionType>(`/api/v1/mission-types/${input.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: input.name.trim(), description: input.description?.trim() || undefined }),
      }),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (id: string) =>
      customFetch<{ outcome: 'DELETED' | 'ARCHIVED' }>(`/api/v1/mission-types/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  return { create, edit, remove }
}

export function useVehicleSituation(vehicleId: string) {
  return useQuery({
    queryKey: ['resource', 'vehicles', vehicleId, 'situation'],
    queryFn: () => customFetch<VehicleSituation>(`/api/v1/vehicles/${vehicleId}/situation`),
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

/**
 * Los actos que CAMBIAN el estado (SPEC-0509 Decisión 1). No hay «cambiar
 * estado» a secas: cada estado sale del acto que lo justifica.
 */
export function useOperationalActions(vehicleId: string) {
  const queryClient = useQueryClient()
  // Todo lo del vehículo: estado, situación, historial e inventario.
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['resource', 'vehicles'] })


  const endMission = useMutation({
    mutationFn: (input: {
      closingNote?: string
      returnOdometerKm?: number
      sendToMaintenance: boolean
      workshopReason?: string
    }) =>
      customFetch(`/api/v1/vehicles/${vehicleId}/release`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  })

  const openOrder = useMutation({
    mutationFn: (input: {
      orderType: 'PREVENTIVE' | 'CORRECTIVE'
      description: string
      expectedExitAt?: string
      /** SPEC-0510: con fecha, queda programada y el vehículo no cambia. */
      scheduledFor?: string
    }) =>
      customFetch(`/api/v1/vehicles/${vehicleId}/maintenance-orders`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  })

  const closeOrder = useMutation({
    mutationFn: (input: { orderId: string; cost?: number; closingNote: string }) =>
      customFetch(`/api/v1/maintenance-orders/${input.orderId}/close`, {
        method: 'POST',
        body: JSON.stringify({ cost: input.cost, closingNote: input.closingNote }),
      }),
    onSuccess: invalidate,
  })

  const startOrder = useMutation({
    mutationFn: (orderId: string) =>
      customFetch(`/api/v1/maintenance-orders/${orderId}/start`, { method: 'POST' }),
    onSuccess: invalidate,
  })

  const cancelOrder = useMutation({
    mutationFn: (input: { orderId: string; reason: string }) =>
      customFetch(`/api/v1/maintenance-orders/${input.orderId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: input.reason }),
      }),
    onSuccess: invalidate,
  })

  const recordFuel = useMutation({
    mutationFn: (input: { liters: number; cost?: number; odometerKm?: number }) =>
      customFetch(`/api/v1/vehicles/${vehicleId}/fuel`, {
        method: 'POST',
        body: JSON.stringify({ ...input, loadedAt: new Date().toISOString() }),
      }),
    onSuccess: invalidate,
  })

  return { endMission, openOrder, closeOrder, startOrder, cancelOrder, recordFuel }
}

/**
 * SPEC-0510 Decisión 2: los casos abiertos de la unidad del vehículo. Sustituye
 * la consulta a `/case-files/{radicado}`, que traía el expediente entero.
 */
export function useLinkableCases(vehicleId: string, fragment: string, enabled = true) {
  const query = fragment.trim()
  return useQuery({
    queryKey: ['resource', 'vehicles', vehicleId, 'linkable-cases', query],
    queryFn: () =>
      customFetch<LinkableCase[]>(
        `/api/v1/vehicles/${vehicleId}/linkable-cases${query ? `?q=${encodeURIComponent(query)}` : ''}`,
      ),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    networkMode: 'always',
    retry: false,
  })
}

/** SPEC-0510 Decisión 4: métricas de la ventana, calculadas al consultar. */
export function useVehicleMetrics(vehicleId: string, days = 30) {
  return useQuery({
    queryKey: ['resource', 'vehicles', vehicleId, 'metrics', days],
    queryFn: () => customFetch<VehicleMetrics>(`/api/v1/vehicles/${vehicleId}/metrics?days=${days}`),
    networkMode: 'always',
    retry: false,
  })
}

// --- SPEC-0512: conductores ---------------------------------------------------------------------

function driverBody(values: DriverFormValues) {
  return {
    territorialUnitId: values.territorialUnitId || undefined,
    rank: values.rank || undefined,
    firstName: values.firstName,
    lastName: values.lastName,
    militaryId: values.militaryId,
    licenseNumber: values.licenseNumber,
    licenseCategory: values.licenseCategory,
    licenseExpiresOn: values.licenseExpiresOn || undefined,
    appUserId: values.appUserId || undefined,
  }
}

export function useDrivers(includeDecommissioned: boolean, enabled = true) {
  return useQuery({
    queryKey: ['resource', 'drivers', { includeDecommissioned }],
    queryFn: () => customFetch<DriverRecord[]>(`/api/v1/drivers?includeDecommissioned=${includeDecommissioned}`),
    enabled,
    networkMode: 'always',
    retry: false,
  })
}

export function useDriverMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['resource'] })

  const register = useMutation({
    mutationFn: (values: DriverFormValues) =>
      customFetch<DriverRecord>('/api/v1/drivers', { method: 'POST', body: JSON.stringify(driverBody(values)) }),
    onSuccess: invalidate,
  })

  /** Con la versión que está en pantalla: si otro lo corrigió antes, 409 en vez de pisarlo. */
  const update = useMutation({
    mutationFn: (input: { driver: DriverRecord; values: DriverFormValues }) =>
      customFetch<DriverRecord>(`/api/v1/drivers/${input.driver.id}`, {
        method: 'PUT',
        headers: { 'If-Match': `"${input.driver.version}"` },
        body: JSON.stringify(driverBody(input.values)),
      }),
    onSuccess: invalidate,
  })

  const decommission = useMutation({
    mutationFn: (input: { driverId: string; reason: string }) =>
      customFetch<DriverRecord>(`/api/v1/drivers/${input.driverId}/decommission`, {
        method: 'POST',
        body: JSON.stringify({ note: input.reason }),
      }),
    onSuccess: invalidate,
  })

  const reactivate = useMutation({
    mutationFn: (driverId: string) =>
      customFetch<DriverRecord>(`/api/v1/drivers/${driverId}/reactivate`, { method: 'POST' }),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (driverId: string) =>
      customFetch<{ outcome: 'DELETED' | 'ARCHIVED' }>(`/api/v1/drivers/${driverId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  return { register, update, decommission, reactivate, remove }
}

export function useLinkableUsers(territorialUnitId: string, enabled = true) {
  return useQuery({
    queryKey: ['resource', 'drivers', 'linkable-users', territorialUnitId],
    queryFn: () => customFetch<LinkableUser[]>(`/api/v1/drivers/linkable-users?territorialUnitId=${territorialUnitId}`),
    enabled: enabled && Boolean(territorialUnitId),
    networkMode: 'always',
    retry: false,
  })
}

export function useAuthorizedDrivers(vehicleId: string, enabled = true) {
  return useQuery({
    queryKey: ['resource', 'vehicles', vehicleId, 'authorized-drivers'],
    queryFn: () => customFetch<AuthorizedDriver[]>(`/api/v1/vehicles/${vehicleId}/authorized-drivers`),
    enabled,
    networkMode: 'always',
    retry: false,
  })
}

export function useAuthorizationMutations(vehicleId: string) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['resource'] })

  const authorize = useMutation({
    mutationFn: (driverId: string) =>
      customFetch<AuthorizedDriver[]>(`/api/v1/vehicles/${vehicleId}/authorized-drivers`, {
        method: 'POST',
        body: JSON.stringify({ driverId }),
      }),
    onSuccess: invalidate,
  })

  const revoke = useMutation({
    mutationFn: (driverId: string) =>
      customFetch<AuthorizedDriver[]>(`/api/v1/vehicles/${vehicleId}/authorized-drivers/${driverId}`, {
        method: 'DELETE',
      }),
    onSuccess: invalidate,
  })

  return { authorize, revoke }
}

// --- SPEC-0512: misiones ------------------------------------------------------------------------

export function useMissions(filter: { status?: MissionStatus; vehicleId?: string }, enabled = true) {
  return useQuery({
    queryKey: ['resource', 'missions', filter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (filter.status) params.set('status', filter.status)
      if (filter.vehicleId) params.set('vehicleId', filter.vehicleId)
      const query = params.toString()
      return customFetch<Mission[]>(`/api/v1/missions${query ? `?${query}` : ''}`)
    },
    enabled,
    placeholderData: keepPreviousData,
    networkMode: 'always',
    retry: false,
  })
}

export function useMission(missionId: string) {
  return useQuery({
    queryKey: ['resource', 'missions', missionId],
    queryFn: () => customFetch<Mission>(`/api/v1/missions/${missionId}`),
    networkMode: 'always',
    retry: false,
  })
}

export interface MissionPlanInput {
  territorialUnitId?: string
  missionTypeId: string
  caseFileId?: string
  purpose?: string
  plannedStartAt?: string
  expectedEndAt?: string
}

export function useMissionMutations(missionId?: string) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['resource'] })
  const base = `/api/v1/missions/${missionId ?? ''}`

  const plan = useMutation({
    mutationFn: (input: MissionPlanInput) =>
      customFetch<Mission>('/api/v1/missions', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  })
  const edit = useMutation({
    mutationFn: (input: MissionPlanInput) => customFetch<Mission>(base, { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  })
  const addVehicle = useMutation({
    mutationFn: (input: { vehicleId: string; crew: CrewInput[] }) =>
      customFetch<Mission>(`${base}/vehicles`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  })
  const replaceCrew = useMutation({
    mutationFn: (input: { vehicleId: string; crew: CrewInput[] }) =>
      customFetch<Mission>(`${base}/vehicles/${input.vehicleId}/crew`, {
        method: 'PUT',
        body: JSON.stringify({ crew: input.crew }),
      }),
    onSuccess: invalidate,
  })
  const removeVehicle = useMutation({
    mutationFn: (vehicleId: string) => customFetch<Mission>(`${base}/vehicles/${vehicleId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
  const start = useMutation({
    mutationFn: () => customFetch<Mission>(`${base}/start`, { method: 'POST' }),
    onSuccess: invalidate,
  })
  const complete = useMutation({
    mutationFn: (note: string) =>
      customFetch<Mission>(`${base}/complete`, { method: 'POST', body: JSON.stringify({ note }) }),
    onSuccess: invalidate,
  })
  const cancel = useMutation({
    mutationFn: (reason: string) =>
      customFetch<Mission>(`${base}/cancel`, { method: 'POST', body: JSON.stringify({ note: reason }) }),
    onSuccess: invalidate,
  })

  return { plan, edit, addVehicle, replaceCrew, removeVehicle, start, complete, cancel }
}

export function useDriverOptions(missionId: string, vehicleId: string, enabled = true) {
  return useQuery({
    queryKey: ['resource', 'missions', missionId, 'driver-options', vehicleId],
    queryFn: () => customFetch<DriverOption[]>(`/api/v1/missions/${missionId}/driver-options?vehicleId=${vehicleId}`),
    enabled: enabled && Boolean(vehicleId),
    networkMode: 'always',
    retry: false,
  })
}

/** Casos abiertos de una unidad, para una misión que aún no tiene vehículos (SPEC-0510). */
export function useUnitLinkableCases(territorialUnitId: string, fragment: string, enabled = true) {
  const query = fragment.trim()
  return useQuery({
    queryKey: ['resource', 'missions', 'linkable-cases', territorialUnitId, query],
    queryFn: () =>
      customFetch<LinkableCase[]>(
        `/api/v1/missions/linkable-cases?territorialUnitId=${territorialUnitId}${query ? `&q=${encodeURIComponent(query)}` : ''}`,
      ),
    enabled: enabled && Boolean(territorialUnitId),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    networkMode: 'always',
    retry: false,
  })
}

