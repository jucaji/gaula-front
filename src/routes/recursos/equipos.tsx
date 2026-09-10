import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import { EmptyState } from '@/design-system/patterns/EmptyState'
import { FleetNav } from '@/design-system/patterns/FleetNav'
import { useDeviceMutations, useDevices } from '@/lib/fleet/useFleetAdmin'
import { DEVICE_STATUS_LABEL, type TrackingDevice } from '@/lib/fleet/types'

/**
 * SPEC-0507 CA-10: los equipos GPS.
 *
 * <p>El alta de equipos existía desde SPEC-0506 como endpoint, y contra un
 * endpoint sin pantalla sólo se puede programar. Sin esta lista, vincular un
 * vehículo a un GPS exigía teclear un UUID leído de la base de datos.
 */
export const Route = createFileRoute('/recursos/equipos')({
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'TRACKING_DEVICE')) {
      throw redirect({ to: '/', search: { denied: 'TRACKING_DEVICE' } })
    }
  },
  component: DevicesPage,
})

function RegisterDevicePanel({ onDone }: { onDone: () => void }) {
  const [providerCode, setProviderCode] = useState('')
  const [externalDeviceId, setExternalDeviceId] = useState('')
  const [label, setLabel] = useState('')
  const { registerDevice } = useDeviceMutations()

  return (
    <form
      className="mt-4 flex flex-col gap-3 rounded-sm border border-border-strong bg-surface-raised p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void registerDevice.mutateAsync({ providerCode, externalDeviceId, label })
          .then(() => { setProviderCode(''); setExternalDeviceId(''); setLabel(''); onDone() })
          .catch(() => undefined)
      }}
    >
      <h2 className="text-sm font-semibold text-text-primary">Registrar equipo</h2>

      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-sm text-text-primary">
          Proveedor *
          <Input value={providerCode} maxLength={30} placeholder="SIMULATOR, ACME…"
                 onChange={(event) => setProviderCode(event.target.value)} />
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-sm text-text-primary">
          Identificador del proveedor *
          <Input value={externalDeviceId} maxLength={120} placeholder="IMEI o serie"
                 onChange={(event) => setExternalDeviceId(event.target.value)} />
          <span className="text-xs text-text-secondary">
            Es como el proveedor nombra el equipo. Con él llegan sus posiciones.
          </span>
        </label>
        <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-sm text-text-primary">
          Etiqueta
          <Input value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} />
        </label>
      </div>

      {registerDevice.isError && (
        <p className="text-sm text-critical">
          {registerDevice.error instanceof Error ? registerDevice.error.message : 'No se pudo registrar el equipo.'}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" loading={registerDevice.isPending}
                disabled={providerCode.trim() === '' || externalDeviceId.trim() === ''}>
          Registrar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancelar</Button>
      </div>
    </form>
  )
}

function DeviceRow({ device }: { device: TrackingDevice }) {
  const { renameDevice, decommissionDevice } = useDeviceMutations()
  const [label, setLabel] = useState(device.label ?? '')
  const [renaming, setRenaming] = useState(false)

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-1 py-3">
      <div className="min-w-[12rem]">
        <p className="text-sm text-text-primary">{device.label || device.externalDeviceId}</p>
        <p className="text-xs text-text-secondary">
          {device.providerCode} · {device.externalDeviceId} · {DEVICE_STATUS_LABEL[device.status]}
        </p>
      </div>

      <p className="text-sm text-text-secondary">
        {/* Un equipo libre es el que se puede vincular: se dice, no se deja en blanco. */}
        {device.plate ? `Vinculado a ${device.plate}` : 'Libre'}
      </p>

      {renaming ? (
        <div className="flex items-center gap-2">
          <Input size="sm" value={label} maxLength={120} aria-label="Nueva etiqueta"
                 onChange={(event) => setLabel(event.target.value)} />
          <Button variant="primary" size="sm" loading={renameDevice.isPending} disabled={label.trim() === ''}
                  onClick={() => void renameDevice.mutateAsync({ deviceId: device.deviceId, label })
                    .then(() => setRenaming(false))
                    .catch(() => undefined)}>
            Guardar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRenaming(false)}>Cancelar</Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setRenaming(true)}>Renombrar</Button>
          {device.status !== 'DECOMMISSIONED' && (
            <Button variant="danger" size="sm" loading={decommissionDevice.isPending}
                    onClick={() => void decommissionDevice.mutateAsync(device.deviceId).catch(() => undefined)}>
              Dar de baja
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

function DevicesPage() {
  const devices = useDevices()
  const [registering, setRegistering] = useState(false)
  const rows = devices.data?.content ?? []

  return (
    <div className="flex h-full flex-col">
      <FleetNav />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-text-primary">Equipos GPS</h1>
        {!registering && (
          <Button variant="primary" size="sm" onClick={() => setRegistering(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Registrar equipo
          </Button>
        )}
      </div>

      {registering && <RegisterDevicePanel onDone={() => setRegistering(false)} />}

      {devices.isLoading && <p className="mt-4 text-sm text-text-secondary">Cargando…</p>}
      {devices.isError && <p className="mt-4 text-sm text-critical">No se pudo cargar el inventario de equipos.</p>}
      {!devices.isLoading && !devices.isError && rows.length === 0 && (
        <EmptyState
          title="Todavía no hay equipos registrados"
          description="Registre el primer equipo GPS para poder vincularlo a un vehículo."
        />
      )}

      {rows.length > 0 && (
        <ul className="mt-4" aria-label="Equipos GPS">
          {rows.map((device) => <DeviceRow key={device.deviceId} device={device} />)}
        </ul>
      )}
    </div>
  )
}
