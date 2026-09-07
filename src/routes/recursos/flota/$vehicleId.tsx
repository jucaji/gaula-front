import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { customFetch } from '@/api/client'
import type { VehicleResponse } from '@/api/generated/models'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'

export const Route = createFileRoute('/recursos/flota/$vehicleId')({
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'FLEET')) {
      throw redirect({ to: '/', search: { denied: 'FLEET' } })
    }
  },
  component: VehicleDetailPage,
})

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'Disponible',
  IN_MISSION: 'En misión',
  MAINTENANCE: 'En mantenimiento',
  OUT_OF_SERVICE: 'Fuera de servicio',
}

function useVehicle(vehicleId: string) {
  return useQuery({
    queryKey: ['resource', 'vehicles', vehicleId],
    queryFn: () => customFetch<VehicleResponse>(`/api/v1/vehicles/${vehicleId}`),
    networkMode: 'always',
    retry: false,
  })
}

function VehicleDetailPage() {
  const { vehicleId } = Route.useParams()
  const queryClient = useQueryClient()
  const vehicle = useVehicle(vehicleId)

  const [driverId, setDriverId] = useState('')
  const [caseFileId, setCaseFileId] = useState('')
  const [purpose, setPurpose] = useState('')
  const [sendToMaintenance, setSendToMaintenance] = useState(false)
  const [liters, setLiters] = useState('')
  const [cost, setCost] = useState('')
  const [odometerKm, setOdometerKm] = useState('')
  const [orderType, setOrderType] = useState<'PREVENTIVE' | 'CORRECTIVE'>('PREVENTIVE')
  const [orderDescription, setOrderDescription] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['resource', 'vehicles', vehicleId] })
    await queryClient.invalidateQueries({ queryKey: ['resource', 'vehicle-assignments'] })
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      await invalidate()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo completar la acción.')
    } finally {
      setBusy(false)
    }
  }

  async function handleAssign() {
    if (!driverId.trim()) return
    await run(() =>
      customFetch(`/api/v1/vehicles/${vehicleId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ driverId, caseFileId: caseFileId || undefined, purpose: purpose || undefined }),
      }),
    )
    setDriverId('')
    setCaseFileId('')
    setPurpose('')
  }

  async function handleRelease() {
    await run(() =>
      customFetch(`/api/v1/vehicles/${vehicleId}/release`, {
        method: 'POST',
        body: JSON.stringify({ sendToMaintenance }),
      }),
    )
    setSendToMaintenance(false)
  }

  async function handleRecordFuel() {
    if (!liters.trim()) return
    await run(() =>
      customFetch(`/api/v1/vehicles/${vehicleId}/fuel`, {
        method: 'POST',
        body: JSON.stringify({
          liters: Number(liters),
          cost: cost ? Number(cost) : undefined,
          odometerKm: odometerKm ? Number(odometerKm) : undefined,
          loadedAt: new Date().toISOString(),
        }),
      }),
    )
    setLiters('')
    setCost('')
    setOdometerKm('')
  }

  async function handleOpenMaintenance() {
    if (!orderDescription.trim()) return
    await run(() =>
      customFetch(`/api/v1/vehicles/${vehicleId}/maintenance-orders`, {
        method: 'POST',
        body: JSON.stringify({ orderType, description: orderDescription }),
      }),
    )
    setOrderDescription('')
  }

  if (vehicle.isLoading) return <p className="p-6 text-sm text-text-secondary">Cargando…</p>
  if (vehicle.isError || !vehicle.data) return <p className="p-6 text-sm text-critical">No se pudo cargar el vehículo.</p>

  const data = vehicle.data
  const isAvailable = data.status === 'AVAILABLE'
  const isInMission = data.status === 'IN_MISSION'

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold text-text-primary">{data.plate}</h1>
      <p className="text-sm text-text-secondary">
        {[data.vehicleType, data.make, data.model, data.modelYear].filter(Boolean).join(' ')} · {data.odometerKm?.toLocaleString('es-CO')} km
      </p>
      <p className="mt-1 text-sm font-medium text-text-primary">Estado: {STATUS_LABEL[data.status ?? ''] ?? data.status}</p>

      {actionError && <p className="mt-3 text-sm text-critical">{actionError}</p>}

      {isAvailable && (
        <div className="mt-4 flex flex-col gap-2 rounded-sm border border-border-strong p-3">
          <h2 className="text-sm font-semibold text-text-primary">Asignar</h2>
          <label className="flex flex-col gap-1 text-sm text-text-primary">
            Conductor (id) *
            <Input value={driverId} onChange={(event) => setDriverId(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-primary">
            Caso vinculado (id, opcional)
            <Input value={caseFileId} onChange={(event) => setCaseFileId(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-primary">
            Propósito (opcional)
            <Input value={purpose} onChange={(event) => setPurpose(event.target.value)} />
          </label>
          <div>
            <Button variant="primary" size="sm" loading={busy} disabled={!driverId.trim()} onClick={handleAssign}>
              Asignar vehículo
            </Button>
          </div>
        </div>
      )}

      {isInMission && (
        <div className="mt-4 flex flex-col gap-2 rounded-sm border border-border-strong p-3">
          <h2 className="text-sm font-semibold text-text-primary">Liberar</h2>
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={sendToMaintenance} onChange={(event) => setSendToMaintenance(event.target.checked)} />
            Enviar a mantenimiento al liberar
          </label>
          <div>
            <Button variant="secondary" size="sm" loading={busy} onClick={handleRelease}>
              Liberar vehículo
            </Button>
          </div>
        </div>
      )}

      {data.status !== 'OUT_OF_SERVICE' && (
        <div className="mt-4 flex flex-col gap-2 rounded-sm border border-border-strong p-3">
          <h2 className="text-sm font-semibold text-text-primary">Registrar combustible</h2>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm text-text-primary">
              Litros *
              <Input type="number" value={liters} onChange={(event) => setLiters(event.target.value)} />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm text-text-primary">
              Costo
              <Input type="number" value={cost} onChange={(event) => setCost(event.target.value)} />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm text-text-primary">
              Odómetro (km)
              <Input type="number" value={odometerKm} onChange={(event) => setOdometerKm(event.target.value)} />
            </label>
          </div>
          <div>
            <Button variant="secondary" size="sm" loading={busy} disabled={!liters.trim()} onClick={handleRecordFuel}>
              Registrar
            </Button>
          </div>
        </div>
      )}

      {data.status !== 'OUT_OF_SERVICE' && (
        <div className="mt-4 flex flex-col gap-2 rounded-sm border border-border-strong p-3">
          <h2 className="text-sm font-semibold text-text-primary">Abrir orden de mantenimiento</h2>
          <label className="flex flex-col gap-1 text-sm text-text-primary">
            Tipo
            <select
              value={orderType}
              onChange={(event) => setOrderType(event.target.value as 'PREVENTIVE' | 'CORRECTIVE')}
              className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
            >
              <option value="PREVENTIVE">Preventivo</option>
              <option value="CORRECTIVE">Correctivo</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-primary">
            Descripción *
            <Input value={orderDescription} onChange={(event) => setOrderDescription(event.target.value)} />
          </label>
          <div>
            <Button variant="secondary" size="sm" loading={busy} disabled={!orderDescription.trim()} onClick={handleOpenMaintenance}>
              Abrir orden
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
