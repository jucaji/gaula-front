import { useDeferredValue, useState } from 'react'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { z } from 'zod'
import { Badge } from '@/design-system/primitives/Badge'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import { EmptyState } from '@/design-system/patterns/EmptyState'
import { FleetNav } from '@/design-system/patterns/FleetNav'
import { MissionTypesDialog } from '@/design-system/domain/MissionTypesDialog'
import { formatDateTime } from '@/lib/format/formatDateTime'
import { useSessionQuery } from '@/lib/auth/useSession'
import {
  useMissionMutations,
  useMissionTypes,
  useMissions,
  useTerritorialUnits,
  useUnitLinkableCases,
} from '@/lib/fleet/useFleetAdmin'
import {
  CASE_STATUS_LABEL,
  MISSION_STATUS_LABEL,
  MISSION_STATUS_TONE,
  type Mission,
  type MissionStatus,
} from '@/lib/fleet/types'

const STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const

/**
 * SPEC-0512 Decisión 1: las misiones. `?nueva=1&vehiculo=` abre el formulario
 * desde la ficha de un vehículo («Crear misión con este vehículo»).
 */
const missionsSearchSchema = z.object({
  status: z.enum(STATUSES).optional().catch(undefined),
  nueva: z.boolean().optional().catch(undefined),
  vehiculo: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/recursos/misiones/')({
  validateSearch: missionsSearchSchema,
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'FLEET')) {
      throw redirect({ to: '/', search: { denied: 'FLEET' } })
    }
  },
  component: MissionsPage,
})

const SELECT =
  'h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary'

function errorOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function toInstant(localValue: string): string | undefined {
  return localValue ? new Date(localValue).toISOString() : undefined
}

function PlanMissionPanel({ vehicleId, onDone }: { vehicleId?: string | undefined; onDone: () => void }) {
  const session = useSessionQuery()
  const navigate = Route.useNavigate()
  const { can } = Route.useRouteContext()
  const units = useTerritorialUnits()
  const types = useMissionTypes()
  const { plan } = useMissionMutations()
  const [unitId, setUnitId] = useState(session.data?.territorialUnitId ?? '')
  const [missionTypeId, setMissionTypeId] = useState('')
  const [caseFilter, setCaseFilter] = useState('')
  const [caseFileId, setCaseFileId] = useState('')
  const [purpose, setPurpose] = useState('')
  const [plannedStart, setPlannedStart] = useState('')
  const [expectedEnd, setExpectedEnd] = useState('')
  const cases = useUnitLinkableCases(unitId, useDeferredValue(caseFilter))
  const activeTypes = (types.data ?? []).filter((type) => type.active)

  return (
    <form
      className="mt-4 flex flex-col gap-3 rounded-md border border-border-strong bg-surface-raised p-4"
      aria-label="Nueva misión"
      onSubmit={(event) => {
        event.preventDefault()
        void plan.mutateAsync({
          missionTypeId,
          ...(unitId ? { territorialUnitId: unitId } : {}),
          ...(caseFileId ? { caseFileId } : {}),
          ...(purpose ? { purpose } : {}),
          ...(plannedStart ? { plannedStartAt: toInstant(plannedStart) ?? '' } : {}),
          ...(expectedEnd ? { expectedEndAt: toInstant(expectedEnd) ?? '' } : {}),
        })
          .then((mission) => {
            onDone()
            void navigate({
              to: '/recursos/misiones/$missionId',
              params: { missionId: mission.id },
              search: vehicleId ? { vehiculo: vehicleId } : {},
            })
          })
          .catch(() => undefined)
      }}
    >
      <h2 className="text-sm font-semibold text-text-primary">Nueva misión</h2>
      <p className="text-xs text-text-secondary">
        Se crea planeada: no ocupa vehículos ni conductores hasta que se inicie. Los vehículos y conductores se agregan en el siguiente paso.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Unidad territorial *
          <select value={unitId} onChange={(event) => { setUnitId(event.target.value); setCaseFileId('') }} className={SELECT}>
            <option value="">Seleccione…</option>
            {(units.data ?? []).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="mission-type-new" className="text-sm text-text-primary">Tipo de misión *</label>
            {can('CREATE', 'FLEET') && <MissionTypesDialog triggerLabel="Gestionar tipos" />}
          </div>
          <select id="mission-type-new" value={missionTypeId} onChange={(event) => setMissionTypeId(event.target.value)}
                  className={SELECT}>
            <option value="">Seleccione…</option>
            {activeTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 md:col-span-2">
          <label htmlFor="mission-case-filter" className="text-sm text-text-primary">Caso vinculado</label>
          <div className="flex flex-wrap gap-2">
            <div className="w-48 shrink-0">
              <Input id="mission-case-filter" placeholder="Filtrar por radicado" value={caseFilter}
                     aria-label="Filtrar casos por radicado" onChange={(event) => setCaseFilter(event.target.value)} />
            </div>
            <select aria-label="Caso vinculado" value={caseFileId} onChange={(event) => setCaseFileId(event.target.value)}
                    className={`${SELECT} min-w-[16rem] flex-1`} disabled={!unitId}>
              <option value="">Sin caso</option>
              {(cases.data ?? []).map((linkable) => (
                <option key={linkable.id} value={linkable.id}>
                  {linkable.trackingNumber} · {CASE_STATUS_LABEL[linkable.status] ?? linkable.status}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs text-text-secondary">Sólo casos abiertos de la unidad. Se ve el radicado y el estado, no el expediente.</span>
        </div>
        <label className="flex flex-col gap-1 text-sm text-text-primary md:col-span-2">
          Propósito
          <Input value={purpose} maxLength={500} onChange={(event) => setPurpose(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Inicio previsto
          <Input type="datetime-local" value={plannedStart} onChange={(event) => setPlannedStart(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Fin estimado
          <Input type="datetime-local" value={expectedEnd} onChange={(event) => setExpectedEnd(event.target.value)} />
        </label>
      </div>
      {plan.isError && <p className="text-sm text-critical">{errorOf(plan.error, 'No se pudo crear la misión.')}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" loading={plan.isPending} disabled={!unitId || !missionTypeId}>
          Crear misión
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancelar</Button>
      </div>
    </form>
  )
}

function MissionRow({ mission }: { mission: Mission }) {
  const plates = mission.vehicles.map((vehicle) => vehicle.plate).filter(Boolean)
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-1 py-3">
      <div className="flex min-w-[14rem] flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-primary">
          <Link to="/recursos/misiones/$missionId" params={{ missionId: mission.id }} className="text-accent-hover underline">
            {mission.code}
          </Link>
          <Badge tone={MISSION_STATUS_TONE[mission.status]}>{MISSION_STATUS_LABEL[mission.status]}</Badge>
          {mission.overdue && <Badge tone="critical">Vencida</Badge>}
        </p>
        <p className="text-xs text-text-secondary">
          {mission.missionTypeName ?? 'Sin tipo'}
          {mission.caseTrackingNumber ? ` · caso ${mission.caseTrackingNumber}` : ''}
          {mission.purpose ? ` · ${mission.purpose}` : ''}
        </p>
      </div>
      <p className="text-sm text-text-secondary">{plates.length > 0 ? plates.join(', ') : 'Sin vehículos'}</p>
      <p className="text-xs text-text-secondary">
        {mission.startedAt
          ? `Inició ${formatDateTime(mission.startedAt)}`
          : mission.plannedStartAt ? `Prevista ${formatDateTime(mission.plannedStartAt)}` : 'Sin fecha prevista'}
      </p>
    </li>
  )
}

function MissionsPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { can } = Route.useRouteContext()
  const canCreate = can('CREATE', 'FLEET')
  const [creating, setCreating] = useState(Boolean(search.nueva))
  const missions = useMissions(search.status ? { status: search.status } : {})
  const rows = missions.data ?? []

  return (
    <div className="flex h-full flex-col">
      <FleetNav />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-text-primary">Misiones</h1>
        {canCreate && !creating && (
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Nueva misión
          </Button>
        )}
      </div>

      {creating && canCreate && (
        <PlanMissionPanel vehicleId={search.vehiculo}
                          onDone={() => { setCreating(false); void navigate({ search: (prev) => ({ ...prev, nueva: undefined }) }) }} />
      )}

      <label className="mt-4 flex w-fit flex-col gap-1 text-xs text-text-secondary">
        Estado
        <select
          value={search.status ?? ''}
          onChange={(event) => void navigate({ search: (prev) => ({ ...prev, status: (event.target.value || undefined) as MissionStatus | undefined }) })}
          className="h-[var(--control-height-sm)] rounded-sm border border-border-strong bg-surface px-2 text-xs text-text-primary"
        >
          <option value="">Todas</option>
          {STATUSES.map((status) => <option key={status} value={status}>{MISSION_STATUS_LABEL[status]}</option>)}
        </select>
      </label>

      {missions.isLoading && <p className="mt-4 text-sm text-text-secondary">Cargando…</p>}
      {missions.isError && <p className="mt-4 text-sm text-critical">No se pudieron cargar las misiones.</p>}
      {missions.data && rows.length === 0 && (
        <EmptyState
          title={search.status ? 'Ninguna misión en ese estado' : 'Aquí no aparece ninguna misión'}
          description="Esta lista muestra las misiones de las unidades que su rol alcanza. Cree una con «Nueva misión»."
        />
      )}
      {rows.length > 0 && (
        <ul className="mt-2 flex flex-col" aria-label="Misiones">
          {rows.map((mission) => <MissionRow key={mission.id} mission={mission} />)}
        </ul>
      )}
    </div>
  )
}
