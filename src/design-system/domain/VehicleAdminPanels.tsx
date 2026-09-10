import { useState } from 'react'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import { VehicleForm } from '@/design-system/domain/VehicleForm'
import { useDeviceMutations, useDevices, useFleetMutations, useTerritorialUnits } from '@/lib/fleet/useFleetAdmin'
import { DEVICE_STATUS_LABEL, isVehicleFormComplete, vehicleToForm, type TrackingDevice, type Vehicle, type VehicleFormValues } from '@/lib/fleet/types'

/**
 * Cada acción es una tarjeta de nivel 2 (docs/06 §4): superficie elevada, borde
 * de 1 px y la sombra que el sistema aplica a `bg-surface-raised`.
 *
 * <p>Sin `mt-*`: la separación la pone la rejilla que las coloca. Cuando cada
 * tarjeta traía su propio margen, sólo podían apilarse en una columna — que es
 * justo lo que hacía la pantalla desperdiciar media ventana.
 */
const CARD = 'flex h-fit flex-col gap-3 rounded-md border border-border-strong bg-surface-raised p-4'

function errorOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/** SPEC-0507 CA-4/CA-5: corregir las características. La unidad no se toca aquí. */
export function CorrectVehiclePanel({ vehicle }: { vehicle: Vehicle }) {
  const [values, setValues] = useState<VehicleFormValues>(() => vehicleToForm(vehicle))
  const [open, setOpen] = useState(false)
  const { update } = useFleetMutations(vehicle.id)
  const units = useTerritorialUnits()

  if (!open) {
    return (
      <div className={CARD}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-text-primary">Características</h2>
          <Button variant="secondary" size="sm" onClick={() => { setValues(vehicleToForm(vehicle)); setOpen(true) }}>
            Corregir
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form
      className={CARD}
      onSubmit={(event) => {
        event.preventDefault()
        void update.mutateAsync({ values, version: vehicle.version }).then(() => setOpen(false)).catch(() => undefined)
      }}
    >
      <h2 className="text-sm font-semibold text-text-primary">Corregir características</h2>

      <VehicleForm values={values} onChange={setValues} units={units.data ?? []} mode="edit"
                   disabled={update.isPending} />

      {update.isError && <p className="text-sm text-critical">{errorOf(update.error, 'No se pudo guardar.')}</p>}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" loading={update.isPending}
                disabled={!isVehicleFormComplete(values, 'edit')}>
          Guardar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </form>
  )
}

/**
 * SPEC-0507 CA-6/CA-7: traslado a otra unidad territorial.
 *
 * <p>Panel aparte y con su propia advertencia porque no es un dato más: la
 * unidad territorial decide quién ve el vehículo, aquí y en el mapa.
 */
export function TransferVehiclePanel({ vehicle }: { vehicle: Vehicle }) {
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')
  const units = useTerritorialUnits()
  const { transfer } = useFleetMutations(vehicle.id)

  const current = units.data?.find((unit) => unit.id === vehicle.territorialUnitId)

  return (
    <form
      className={CARD}
      onSubmit={(event) => {
        event.preventDefault()
        void transfer.mutateAsync({ targetTerritorialUnitId: target, reason })
          .then(() => { setTarget(''); setReason('') })
          .catch(() => undefined)
      }}
    >
      <h2 className="text-sm font-semibold text-text-primary">Trasladar de unidad</h2>
      <p className="text-xs text-text-secondary">
        Hoy pertenece a {current ? `${current.name} (${current.code})` : 'una unidad no listada'}. Trasladarlo
        cambia quién puede verlo, en el inventario y en el mapa.
      </p>

      <label className="flex flex-col gap-1 text-sm text-text-primary">
        Unidad de destino *
        <select
          value={target}
          disabled={transfer.isPending}
          onChange={(event) => setTarget(event.target.value)}
          className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
        >
          <option value="">Seleccione…</option>
          {(units.data ?? []).filter((unit) => unit.id !== vehicle.territorialUnitId).map((unit) => (
            <option key={unit.id} value={unit.id}>{unit.name} ({unit.code})</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-text-primary">
        Motivo (queda en la auditoría)
        <Input value={reason} disabled={transfer.isPending} maxLength={500}
               onChange={(event) => setReason(event.target.value)} />
      </label>

      {transfer.isError && <p className="text-sm text-critical">{errorOf(transfer.error, 'No se pudo trasladar.')}</p>}

      <div>
        <Button type="submit" variant="secondary" size="sm" loading={transfer.isPending} disabled={target === ''}>
          Trasladar
        </Button>
      </div>
    </form>
  )
}

/** SPEC-0507 CA-8: baja y reactivación. Dar de baja no borra nada. */
export function VehicleServiceStatusPanel({ vehicle }: { vehicle: Vehicle }) {
  const [reason, setReason] = useState('')
  const { decommission, returnToService } = useFleetMutations(vehicle.id)
  const isOut = vehicle.status === 'OUT_OF_SERVICE'

  return (
    <div className={CARD}>
      <h2 className="text-sm font-semibold text-text-primary">
        {isOut ? 'Reactivar vehículo' : 'Dar de baja'}
      </h2>
      <p className="text-xs text-text-secondary">
        {isOut
          ? 'Vuelve al inventario como disponible.'
          : 'Deja de poder asignarse. No se borra: su historial de asignaciones, combustible y recorridos se conserva.'}
      </p>

      {!isOut && (
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Motivo (queda en la auditoría)
          <Input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
        </label>
      )}

      {decommission.isError && (
        <p className="text-sm text-critical">{errorOf(decommission.error, 'No se pudo dar de baja.')}</p>
      )}
      {returnToService.isError && (
        <p className="text-sm text-critical">{errorOf(returnToService.error, 'No se pudo reactivar.')}</p>
      )}

      <div>
        {isOut ? (
          <Button variant="secondary" size="sm" loading={returnToService.isPending}
                  onClick={() => void returnToService.mutateAsync().catch(() => undefined)}>
            Reactivar
          </Button>
        ) : (
          <Button variant="danger" size="sm" loading={decommission.isPending}
                  onClick={() => void decommission.mutateAsync(reason).catch(() => undefined)}>
            Dar de baja
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * SPEC-0507 CA-11: el equipo GPS de este vehículo.
 *
 * <p>Sólo se dibuja para quien administra equipos ({@code TRACKING_DEVICE}).
 * No es un `display:none`: quien no tenga ese permiso recibiría un 403 del
 * backend en cada acción de aquí, y ofrecer lo que se va a denegar es peor que
 * no ofrecerlo.
 */
export function VehicleDevicePanel({ vehicle }: { vehicle: Vehicle }) {
  const devices = useDevices()
  const { enroll, withdraw } = useDeviceMutations()
  const [deviceId, setDeviceId] = useState('')

  const all: TrackingDevice[] = devices.data?.content ?? []
  const current = all.find((device) => device.vehicleId === vehicle.id)
  const free = all.filter((device) => !device.vehicleId && device.status === 'ACTIVE')

  return (
    <div className={CARD}>
      <h2 className="text-sm font-semibold text-text-primary">Equipo GPS</h2>

      {devices.isLoading && <p className="text-sm text-text-secondary">Consultando equipos…</p>}
      {devices.isError && <p className="text-sm text-critical">No se pudo consultar el inventario de equipos.</p>}

      {current ? (
        <>
          <p className="text-sm text-text-primary">
            {current.label || current.externalDeviceId}
            <span className="text-text-secondary"> · {current.providerCode} · {DEVICE_STATUS_LABEL[current.status]}</span>
          </p>
          {withdraw.isError && (
            <p className="text-sm text-critical">{errorOf(withdraw.error, 'No se pudo desvincular.')}</p>
          )}
          <div>
            <Button variant="secondary" size="sm" loading={withdraw.isPending}
                    onClick={() => void withdraw.mutateAsync(vehicle.id).catch(() => undefined)}>
              Desvincular equipo
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* Un vehículo sin GPS no es un error: puede que la mitad de la flota
              no lo tenga. Se dice, y se ofrece vincular uno. */}
          <p className="text-sm text-text-secondary">Este vehículo no tiene equipo vinculado.</p>

          {!devices.isLoading && free.length === 0 ? (
            <p className="text-sm text-text-secondary">
              No hay equipos libres. Registre uno en la sección de equipos GPS.
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-sm text-text-primary">
                Equipo libre
                <select
                  value={deviceId}
                  onChange={(event) => setDeviceId(event.target.value)}
                  className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
                >
                  <option value="">Seleccione…</option>
                  {free.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || device.externalDeviceId} ({device.providerCode})
                    </option>
                  ))}
                </select>
              </label>
              {enroll.isError && (
                <p className="text-sm text-critical">{errorOf(enroll.error, 'No se pudo vincular.')}</p>
              )}
              <div>
                <Button variant="primary" size="sm" loading={enroll.isPending} disabled={deviceId === ''}
                        onClick={() => void enroll.mutateAsync({ vehicleId: vehicle.id, deviceId })
                          .then(() => setDeviceId(''))
                          .catch(() => undefined)}>
                  Vincular equipo
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
