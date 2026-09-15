import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { Badge } from '@/design-system/primitives/Badge'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import { EmptyState } from '@/design-system/patterns/EmptyState'
import { FleetNav } from '@/design-system/patterns/FleetNav'
import { useSessionQuery } from '@/lib/auth/useSession'
import { useDriverMutations, useDrivers, useLinkableUsers, useTerritorialUnits } from '@/lib/fleet/useFleetAdmin'
import {
  DRIVER_STATUS_LABEL,
  EMPTY_DRIVER_FORM,
  driverToForm,
  isDriverFormComplete,
  type DriverFormValues,
  type DriverRecord,
} from '@/lib/fleet/types'

/**
 * SPEC-0512 Decisión 2: los conductores, gestionados como los vehículos.
 *
 * <p>Un conductor es un registro de flota, no un usuario: un soldado que conduce
 * no necesita cuenta. El vínculo con un usuario es opcional y sirve para que un
 * oficial de campo vea los vehículos de su misión.
 */
export const Route = createFileRoute('/recursos/conductores')({
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'FLEET')) {
      throw redirect({ to: '/', search: { denied: 'FLEET' } })
    }
  },
  component: DriversPage,
})

const SELECT =
  'h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary'

function errorOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function formatDay(isoDate?: string | null): string {
  if (!isoDate) return ''
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

function DriverForm({
  values,
  onChange,
  mode,
}: {
  values: DriverFormValues
  onChange: (values: DriverFormValues) => void
  mode: 'create' | 'edit'
}) {
  const units = useTerritorialUnits()
  const users = useLinkableUsers(values.territorialUnitId)
  const set = (field: keyof DriverFormValues) => (event: { target: { value: string } }) =>
    onChange({ ...values, [field]: event.target.value })

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {mode === 'create' && (
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Unidad territorial *
          <select value={values.territorialUnitId} onChange={set('territorialUnitId')} className={SELECT}>
            <option value="">Seleccione…</option>
            {(units.data ?? []).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm text-text-primary">
        Grado
        <Input value={values.rank} maxLength={40} onChange={set('rank')} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-primary">
        Nombres *
        <Input value={values.firstName} maxLength={80} onChange={set('firstName')} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-primary">
        Apellidos *
        <Input value={values.lastName} maxLength={80} onChange={set('lastName')} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-primary">
        Identificación militar *
        <Input value={values.militaryId} maxLength={30} onChange={set('militaryId')} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-primary">
        Número de licencia *
        <Input value={values.licenseNumber} maxLength={30} onChange={set('licenseNumber')} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-primary">
        Categoría de licencia *
        <Input value={values.licenseCategory} maxLength={10} placeholder="B1, C2…" onChange={set('licenseCategory')} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-primary">
        Licencia vence *
        <Input type="date" value={values.licenseExpiresOn} onChange={set('licenseExpiresOn')} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-primary sm:col-span-2">
        Usuario del sistema vinculado
        <select value={values.appUserId} onChange={set('appUserId')} className={SELECT}
                disabled={!values.territorialUnitId}>
          <option value="">Sin usuario (no usa la consola)</option>
          {/* El que ya estaba vinculado se conserva aunque la lista sólo traiga los libres. */}
          {values.appUserId && !(users.data ?? []).some((user) => user.id === values.appUserId) && (
            <option value={values.appUserId}>Usuario vinculado actualmente</option>
          )}
          {(users.data ?? []).map((user) => (
            <option key={user.id} value={user.id}>{user.displayName}</option>
          ))}
        </select>
        <span className="text-xs text-text-secondary">
          Opcional. Con él, el conductor ve en la consola los vehículos de su misión.
        </span>
      </label>
    </div>
  )
}

function RegisterDriverPanel({ onDone }: { onDone: () => void }) {
  const session = useSessionQuery()
  const [values, setValues] = useState<DriverFormValues>({
    ...EMPTY_DRIVER_FORM,
    territorialUnitId: session.data?.territorialUnitId ?? '',
  })
  const { register } = useDriverMutations()

  return (
    <form
      className="mt-4 flex flex-col gap-3 rounded-md border border-border-strong bg-surface-raised p-4"
      aria-label="Registrar conductor"
      onSubmit={(event) => {
        event.preventDefault()
        void register.mutateAsync(values).then(onDone).catch(() => undefined)
      }}
    >
      <h2 className="text-sm font-semibold text-text-primary">Registrar conductor</h2>
      <DriverForm values={values} onChange={setValues} mode="create" />
      {register.isError && <p className="text-sm text-critical">{errorOf(register.error, 'No se pudo registrar.')}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" loading={register.isPending}
                disabled={!isDriverFormComplete(values) || !values.territorialUnitId}>
          Registrar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancelar</Button>
      </div>
    </form>
  )
}

function LicenseLine({ driver }: { driver: DriverRecord }) {
  if (!driver.licenseExpiresOn) {
    return <Badge tone="critical">Licencia sin registrar</Badge>
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
      Licencia {driver.licenseCategory} · vence {formatDay(driver.licenseExpiresOn)}
      {!driver.licenseValid && <Badge tone="critical">Licencia vencida</Badge>}
    </span>
  )
}

function DriverRow({ driver, canManage }: { driver: DriverRecord; canManage: boolean }) {
  const { update, decommission, reactivate, remove } = useDriverMutations()
  const [mode, setMode] = useState<'view' | 'edit' | 'retire' | 'delete'>('view')
  const [values, setValues] = useState<DriverFormValues>(() => driverToForm(driver))
  const [reason, setReason] = useState('')
  const [outcome, setOutcome] = useState<string | null>(null)
  const error = update.error ?? decommission.error ?? reactivate.error ?? remove.error

  return (
    <li className="flex flex-col gap-3 border-b border-border px-1 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-[14rem] flex-col gap-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-primary">
            {driver.displayName}
            {driver.status === 'DECOMMISSIONED' && <Badge tone="neutral">{DRIVER_STATUS_LABEL[driver.status]}</Badge>}
          </p>
          <p className="text-xs text-text-secondary">Identificación militar {driver.militaryId}</p>
          <LicenseLine driver={driver} />
          {driver.decommissionReason && (
            <p className="text-xs text-text-secondary">Motivo de la baja: {driver.decommissionReason}</p>
          )}
        </div>
        <p className="text-sm text-text-secondary">
          {driver.authorizedPlates.length > 0
            ? `Autorizado para ${driver.authorizedPlates.join(', ')}`
            : 'Sin vehículos autorizados'}
        </p>
        {canManage && mode === 'view' && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setValues(driverToForm(driver)); setMode('edit') }}>
              Editar
            </Button>
            {driver.status === 'ACTIVE' ? (
              <Button variant="secondary" size="sm" onClick={() => setMode('retire')}>Dar de baja</Button>
            ) : (
              <Button variant="secondary" size="sm" loading={reactivate.isPending}
                      onClick={() => void reactivate.mutateAsync(driver.id).catch(() => undefined)}>
                Reactivar
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setMode('delete')}>Eliminar</Button>
          </div>
        )}
      </div>

      {mode === 'edit' && (
        <form
          className="flex flex-col gap-3 rounded-sm border border-border p-3"
          aria-label={`Editar ${driver.displayName}`}
          onSubmit={(event) => {
            event.preventDefault()
            void update.mutateAsync({ driver, values }).then(() => setMode('view')).catch(() => undefined)
          }}
        >
          <DriverForm values={values} onChange={setValues} mode="edit" />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" loading={update.isPending} disabled={!isDriverFormComplete(values)}>
              Guardar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode('view')}>Cancelar</Button>
          </div>
        </form>
      )}

      {mode === 'retire' && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void decommission.mutateAsync({ driverId: driver.id, reason })
              .then(() => { setReason(''); setMode('view') })
              .catch(() => undefined)
          }}
        >
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm text-text-primary">
            Motivo de la baja *
            <Input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
            <span className="text-xs text-text-secondary">Deja de ofrecerse para misiones y pierde sus vehículos autorizados. Su historial se conserva.</span>
          </label>
          <Button type="submit" variant="danger" size="sm" loading={decommission.isPending} disabled={reason.trim() === ''}>
            Confirmar baja
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setMode('view')}>Volver</Button>
        </form>
      )}

      {mode === 'delete' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-text-secondary">
            ¿Eliminar a {driver.displayName}? Si ya condujo o estuvo autorizado para un vehículo, se dará de baja en su lugar.
          </span>
          <Button variant="danger" size="sm" loading={remove.isPending}
                  onClick={() => void remove.mutateAsync(driver.id)
                    .then((result) => {
                      setMode('view')
                      setOutcome(result.outcome === 'ARCHIVED'
                        ? 'Tenía historia en la flota: se dio de baja en vez de eliminarse.'
                        : null)
                    })
                    .catch(() => setMode('view'))}>
            Sí, eliminar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode('view')}>No</Button>
        </div>
      )}

      {outcome && <p className="text-sm text-text-secondary">{outcome}</p>}
      {error && <p className="text-sm text-critical">{errorOf(error, 'No se pudo completar la acción.')}</p>}
    </li>
  )
}

function DriversPage() {
  const { can } = Route.useRouteContext()
  const canCreate = can('CREATE', 'FLEET')
  const canManage = can('UPDATE', 'FLEET')
  const [showRetired, setShowRetired] = useState(false)
  const [registering, setRegistering] = useState(false)
  const drivers = useDrivers(showRetired)
  const rows = drivers.data ?? []

  return (
    <div className="flex h-full flex-col">
      <FleetNav />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-text-primary">Conductores</h1>
        {canCreate && !registering && (
          <Button variant="primary" size="sm" onClick={() => setRegistering(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Registrar conductor
          </Button>
        )}
      </div>

      {registering && <RegisterDriverPanel onDone={() => setRegistering(false)} />}

      <label className="mt-4 flex items-center gap-2 text-sm text-text-primary">
        <input type="checkbox" checked={showRetired} onChange={(event) => setShowRetired(event.target.checked)} />
        Mostrar también los dados de baja
      </label>

      {drivers.isLoading && <p className="mt-4 text-sm text-text-secondary">Cargando…</p>}
      {drivers.isError && <p className="mt-4 text-sm text-critical">No se pudo cargar el registro de conductores.</p>}
      {drivers.data && rows.length === 0 && (
        <EmptyState
          title="Aquí no aparece ningún conductor"
          description="Esta lista muestra los conductores de las unidades que su rol alcanza. Registre el primero con «Registrar conductor»."
        />
      )}
      {rows.length > 0 && (
        <ul className="mt-2 flex flex-col" aria-label="Conductores">
          {rows.map((driver) => <DriverRow key={driver.id} driver={driver} canManage={canManage} />)}
        </ul>
      )}
    </div>
  )
}
