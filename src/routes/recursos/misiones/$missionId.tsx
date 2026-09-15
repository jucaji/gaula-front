import { useState } from 'react'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { customFetch } from '@/api/client'
import type { VehicleResponse } from '@/api/generated/models'
import { Badge } from '@/design-system/primitives/Badge'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import { FleetNav } from '@/design-system/patterns/FleetNav'
import { formatDateTime } from '@/lib/format/formatDateTime'
import { useDriverOptions, useMission, useMissionMutations } from '@/lib/fleet/useFleetAdmin'
import {
  MISSION_STATUS_LABEL,
  MISSION_STATUS_TONE,
  VEHICLE_STATUS_LABEL,
  type CrewInput,
  type Mission,
  type MissionVehicle,
  type VehicleStatus,
} from '@/lib/fleet/types'

const detailSearchSchema = z.object({
  vehiculo: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/recursos/misiones/$missionId')({
  validateSearch: detailSearchSchema,
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'FLEET')) {
      throw redirect({ to: '/', search: { denied: 'FLEET' } })
    }
  },
  component: MissionDetailPage,
})

const CARD = 'flex flex-col gap-3 rounded-md border border-border-strong bg-surface-raised p-4'
const SELECT =
  'h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary'

function errorOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className={value ? 'text-sm text-text-primary' : 'text-sm text-text-muted'}>{value || 'Sin registrar'}</dd>
    </div>
  )
}

/**
 * SPEC-0512 CA-4/CA-10: elegir conductores para un vehículo. Los autorizados van
 * primero; uno no autorizado pide su motivo; el primero elegido es el principal.
 */
function CrewPicker({
  missionId,
  vehicleId,
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  missionId: string
  vehicleId: string
  initial: CrewInput[]
  submitLabel: string
  pending: boolean
  onSubmit: (crew: CrewInput[]) => void
  onCancel?: () => void
}) {
  const options = useDriverOptions(missionId, vehicleId)
  const [crew, setCrew] = useState<CrewInput[]>(initial)
  const byId = new Map((options.data ?? []).map((option) => [option.driverId, option]))
  const missingReason = crew.some((member) => byId.get(member.driverId)?.authorized === false
    && !(member.overrideReason ?? '').trim())

  function toggle(driverId: string) {
    setCrew((current) => current.some((member) => member.driverId === driverId)
      ? current.filter((member) => member.driverId !== driverId)
      : [...current, { driverId }])
  }

  return (
    <div className="flex flex-col gap-2">
      {options.isLoading && <p className="text-sm text-text-secondary">Cargando conductores…</p>}
      {options.data && options.data.length === 0 && (
        <p className="text-sm text-text-secondary">No hay conductores activos en la unidad. Regístrelos en «Conductores».</p>
      )}
      <ul className="flex flex-col gap-2" aria-label="Conductores disponibles">
        {(options.data ?? []).map((option) => {
          const index = crew.findIndex((member) => member.driverId === option.driverId)
          const chosen = index >= 0
          return (
            <li key={option.driverId} className="flex flex-col gap-1 rounded-sm border border-border p-2">
              <label className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
                <input type="checkbox" checked={chosen} onChange={() => toggle(option.driverId)} />
                {option.displayName}
                {option.authorized ? <Badge tone="active">Autorizado</Badge> : <Badge tone="neutral">No autorizado</Badge>}
                {!option.licenseValid && <Badge tone="critical">Licencia vencida o sin registrar</Badge>}
                {option.busy && <Badge tone="alert">En otra misión en curso</Badge>}
                {chosen && index === 0 && <Badge tone="accent">Principal</Badge>}
              </label>
              {chosen && !option.authorized && (
                <label className="flex flex-col gap-1 pl-6 text-xs text-text-primary">
                  Por qué conduce este vehículo sin estar autorizado *
                  <Input size="sm" value={crew[index]?.overrideReason ?? ''} maxLength={500}
                         onChange={(event) => setCrew((current) => current.map((member) =>
                           member.driverId === option.driverId ? { ...member, overrideReason: event.target.value } : member))} />
                </label>
              )}
            </li>
          )
        })}
      </ul>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" loading={pending} disabled={missingReason}
                onClick={() => onSubmit(crew.map((member) => ({
                  driverId: member.driverId,
                  ...(member.overrideReason?.trim() ? { overrideReason: member.overrideReason.trim() } : {}),
                })))}>
          {submitLabel}
        </Button>
        {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>}
      </div>
    </div>
  )
}

function useUnitVehicles(territorialUnitId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['resource', 'vehicles', { territorialUnitId, page: 0, size: 200 }],
    queryFn: () =>
      customFetch<{ content?: VehicleResponse[] }>(
        `/api/v1/vehicles?territorialUnitId=${territorialUnitId}&page=0&size=200`,
      ),
    enabled,
    networkMode: 'always',
    retry: false,
  })
}

function AddVehicleForm({ mission, preselected }: { mission: Mission; preselected?: string | undefined }) {
  const vehicles = useUnitVehicles(mission.territorialUnitId, true)
  const { addVehicle } = useMissionMutations(mission.id)
  const taken = new Set(mission.vehicles.map((vehicle) => vehicle.vehicleId))
  const candidates = (vehicles.data?.content ?? []).filter((vehicle) =>
    vehicle.id && !taken.has(vehicle.id) && vehicle.status !== 'OUT_OF_SERVICE')
  const [vehicleId, setVehicleId] = useState(preselected && !taken.has(preselected) ? preselected : '')

  return (
    <section className={CARD} aria-label="Agregar vehículo">
      <h2 className="text-sm font-semibold text-text-primary">Agregar vehículo</h2>
      <label className="flex flex-col gap-1 text-sm text-text-primary">
        Vehículo *
        <select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} className={SELECT}>
          <option value="">Seleccione…</option>
          {candidates.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.plate} · {VEHICLE_STATUS_LABEL[(vehicle.status ?? 'AVAILABLE') as VehicleStatus]}
            </option>
          ))}
        </select>
        <span className="text-xs text-text-secondary">Puede agregarlo aunque esté ocupado; para iniciar la misión tendrá que estar disponible.</span>
      </label>
      {vehicleId && (
        <CrewPicker key={vehicleId} missionId={mission.id} vehicleId={vehicleId} initial={[]} submitLabel="Agregar vehículo"
                    pending={addVehicle.isPending}
                    onSubmit={(crew) => void addVehicle.mutateAsync({ vehicleId, crew })
                      .then(() => setVehicleId(''))
                      .catch(() => undefined)} />
      )}
      {addVehicle.isError && <p className="text-sm text-critical">{errorOf(addVehicle.error, 'No se pudo agregar el vehículo.')}</p>}
    </section>
  )
}

function VehicleCard({ mission, vehicle, canManage }: { mission: Mission; vehicle: MissionVehicle; canManage: boolean }) {
  const { replaceCrew, removeVehicle } = useMissionMutations(mission.id)
  const [editing, setEditing] = useState(false)
  const planned = mission.status === 'PLANNED'
  const error = replaceCrew.error ?? removeVehicle.error

  return (
    <li className="flex flex-col gap-2 rounded-sm border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/recursos/flota/$vehicleId" params={{ vehicleId: vehicle.vehicleId }}
              className="text-sm font-medium text-accent-hover underline">
          {vehicle.plate ?? 'Vehículo'}
        </Link>
        {vehicle.vehicleStatus && (
          <Badge tone="neutral">{VEHICLE_STATUS_LABEL[vehicle.vehicleStatus as VehicleStatus] ?? vehicle.vehicleStatus}</Badge>
        )}
        {vehicle.releasedAt && <Badge tone="neutral">Salió {formatDateTime(vehicle.releasedAt)}</Badge>}
      </div>
      {vehicle.warnings.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label={`Advertencias de ${vehicle.plate ?? 'vehículo'}`}>
          {vehicle.warnings.map((warning) => <li key={warning} className="text-xs text-alert">{warning}</li>)}
        </ul>
      )}
      {editing ? (
        <CrewPicker missionId={mission.id} vehicleId={vehicle.vehicleId}
                    initial={vehicle.crew.map((member) => ({
                      driverId: member.driverId,
                      ...(member.overrideReason ? { overrideReason: member.overrideReason } : {}),
                    }))}
                    submitLabel="Guardar conductores" pending={replaceCrew.isPending} onCancel={() => setEditing(false)}
                    onSubmit={(crew) => void replaceCrew.mutateAsync({ vehicleId: vehicle.vehicleId, crew })
                      .then(() => setEditing(false))
                      .catch(() => undefined)} />
      ) : vehicle.crew.length === 0 ? (
        <p className="text-sm text-critical">Sin conductor: agregue al menos uno para poder iniciar.</p>
      ) : (
        <ul className="flex flex-col gap-1" aria-label={`Conductores de ${vehicle.plate ?? 'vehículo'}`}>
          {vehicle.crew.map((member, index) => (
            <li key={member.driverId} className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
              {member.displayName ?? 'Conductor'}
              {index === 0 && <Badge tone="accent">Principal</Badge>}
              {!member.authorized && <Badge tone="neutral">No autorizado</Badge>}
              {!member.active && <Badge tone="critical">Dado de baja</Badge>}
              {member.active && !member.licenseValid && <Badge tone="critical">Licencia vencida o sin registrar</Badge>}
              {member.overrideReason && <span className="text-xs text-text-secondary">Motivo: {member.overrideReason}</span>}
            </li>
          ))}
        </ul>
      )}
      {canManage && planned && !editing && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Cambiar conductores</Button>
          <Button variant="ghost" size="sm" loading={removeVehicle.isPending}
                  onClick={() => void removeVehicle.mutateAsync(vehicle.vehicleId).catch(() => undefined)}>
            Quitar vehículo
          </Button>
        </div>
      )}
      {canManage && mission.status === 'IN_PROGRESS' && !vehicle.releasedAt && (
        <p className="text-xs text-text-secondary">
          Para sacar sólo este vehículo, termínelo desde su ficha (pestaña Misiones). La misión termina cuando sale el último.
        </p>
      )}
      {error && <p className="text-sm text-critical">{errorOf(error, 'No se pudo completar la acción.')}</p>}
    </li>
  )
}

function MissionDetailPage() {
  const { missionId } = Route.useParams()
  const search = Route.useSearch()
  const { can } = Route.useRouteContext()
  const canManage = can('UPDATE', 'FLEET')
  const mission = useMission(missionId)
  const { start, complete, cancel } = useMissionMutations(missionId)
  const [closing, setClosing] = useState<'complete' | 'cancel' | null>(null)
  const [note, setNote] = useState('')

  if (mission.isLoading) return <p className="p-6 text-sm text-text-secondary">Cargando…</p>
  if (mission.isError || !mission.data) return <p className="p-6 text-sm text-critical">No se pudo cargar la misión.</p>

  const data = mission.data
  const ready = data.vehicles.length > 0 && data.vehicles.every((vehicle) => vehicle.crew.length > 0)
  const actionError = start.error ?? complete.error ?? cancel.error

  return (
    <div className="flex flex-col gap-4">
      <FleetNav />
      <Link to="/recursos/misiones" search={{}}
            className="inline-flex min-h-[var(--tap-min)] w-fit items-center text-sm text-accent-hover underline">
        ← Volver a misiones
      </Link>

      <section className={CARD} aria-label="Misión">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold text-text-primary">Misión {data.code}</h1>
          <Badge tone={MISSION_STATUS_TONE[data.status]}>{MISSION_STATUS_LABEL[data.status]}</Badge>
          {data.overdue && <Badge tone="critical">Vencida</Badge>}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 xl:grid-cols-6">
          <Detail label="Tipo" value={data.missionTypeName} />
          <Detail label="Caso" value={data.caseTrackingNumber} />
          <Detail label="Propósito" value={data.purpose} />
          <Detail label="Inicio previsto" value={data.plannedStartAt ? formatDateTime(data.plannedStartAt) : null} />
          <Detail label="Fin estimado" value={data.expectedEndAt ? formatDateTime(data.expectedEndAt) : null} />
          <Detail label={data.status === 'CANCELLED' ? 'Cancelada' : 'Inició'}
                  value={data.status === 'CANCELLED'
                    ? (data.endedAt ? formatDateTime(data.endedAt) : null)
                    : (data.startedAt ? formatDateTime(data.startedAt) : null)} />
          {data.status === 'COMPLETED' && (
            <Detail label="Terminó" value={data.endedAt ? formatDateTime(data.endedAt) : null} />
          )}
        </dl>
        {data.cancelReason && <p className="text-sm text-text-secondary">Motivo de la cancelación: {data.cancelReason}</p>}
        {data.closingNote && <p className="text-sm text-text-secondary">Observación de cierre: {data.closingNote}</p>}

        {canManage && data.status === 'PLANNED' && closing === null && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" loading={start.isPending} disabled={!ready}
                    onClick={() => void start.mutateAsync().catch(() => undefined)}>
              Iniciar misión
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setClosing('cancel')}>Cancelar misión</Button>
            {!ready && (
              <span className="text-xs text-text-secondary">Para iniciar: al menos un vehículo, y cada vehículo con su conductor.</span>
            )}
          </div>
        )}
        {canManage && data.status === 'IN_PROGRESS' && closing === null && (
          <div>
            <Button variant="primary" size="sm" onClick={() => setClosing('complete')}>Terminar misión</Button>
          </div>
        )}
        {closing && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              const action = closing === 'cancel' ? cancel.mutateAsync(note) : complete.mutateAsync(note)
              void action.then(() => { setClosing(null); setNote('') }).catch(() => undefined)
            }}
          >
            <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-sm text-text-primary">
              {closing === 'cancel' ? 'Por qué se cancela *' : 'Observación de cierre'}
              <Input value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />
              {closing === 'complete' && (
                <span className="text-xs text-text-secondary">Libera todos los vehículos que siguen en la misión.</span>
              )}
            </label>
            <Button type="submit" variant={closing === 'cancel' ? 'danger' : 'primary'} size="sm"
                    loading={cancel.isPending || complete.isPending} disabled={closing === 'cancel' && note.trim() === ''}>
              {closing === 'cancel' ? 'Confirmar cancelación' : 'Confirmar y terminar'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setClosing(null)}>Volver</Button>
          </form>
        )}
        {actionError && <p className="text-sm text-critical">{errorOf(actionError, 'No se pudo completar la acción.')}</p>}
      </section>

      <section className={CARD} aria-label="Vehículos de la misión">
        <h2 className="text-sm font-semibold text-text-primary">Vehículos y conductores</h2>
        {data.vehicles.length === 0 ? (
          <p className="text-sm text-text-secondary">Todavía no tiene vehículos.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.vehicles.map((vehicle) => (
              <VehicleCard key={vehicle.vehicleId} mission={data} vehicle={vehicle} canManage={canManage} />
            ))}
          </ul>
        )}
      </section>

      {canManage && data.status === 'PLANNED' && <AddVehicleForm mission={data} preselected={search.vehiculo} />}
    </div>
  )
}
