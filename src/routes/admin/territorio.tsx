import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { AdminNav } from '@/design-system/patterns/AdminNav'
import { EmptyState } from '@/design-system/patterns/EmptyState'
import { Badge } from '@/design-system/primitives/Badge'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import {
  useTerritorialCatalogMutations,
  useTerritorialDepartments,
  useTerritorialMunicipalities,
  useTerritorialUnitOptions,
  type MunicipalityAdmin,
} from '@/lib/catalog/useTerritorialCatalog'

/** SPEC-0109: los filtros viven en la URL, como en el resto de la consola (docs/07 §2). */
const searchSchema = z.object({
  q: z.string().optional().catch(undefined),
  departamento: z.string().optional().catch(undefined),
  sinGaula: z.boolean().optional().catch(undefined),
  retirados: z.boolean().optional().catch(undefined),
  page: z.number().catch(0),
})

export const Route = createFileRoute('/admin/territorio')({
  validateSearch: searchSchema,
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'ADMIN')) {
      throw redirect({ to: '/', search: { denied: 'ADMIN' } })
    }
  },
  component: AdminTerritoryPage,
})

const SELECT_CLASS =
  'h-[var(--control-height-sm)] rounded-sm border border-border-strong bg-surface px-2 text-xs text-text-primary'
const SIZE = 50

type Panel = { kind: 'create' } | { kind: 'edit' | 'routing'; municipality: MunicipalityAdmin } | null

/**
 * SPEC-0109: el catálogo territorial, administrable.
 *
 * <p>Un municipio no se borra si algo lo usó: se RETIRA, deja de ofrecerse para
 * abrir casos y sigue rotulando la historia. La pantalla lo dice con esas
 * palabras, porque «eliminar» y «retirar» no son lo mismo y el resultado depende
 * de datos que el administrador no ve.
 */
function AdminTerritoryPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const [panel, setPanel] = useState<Panel>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filters = {
    q: search.q,
    departmentCode: search.departamento,
    onlyWithoutRouting: search.sinGaula ?? false,
    includeRetired: search.retirados ?? false,
    page: search.page,
    size: SIZE,
  }
  const municipalities = useTerritorialMunicipalities(filters)
  const departments = useTerritorialDepartments()
  const mutations = useTerritorialCatalogMutations()

  const rows = municipalities.data?.content ?? []
  const total = municipalities.data?.totalElements ?? 0
  const departmentOptions = departments.data ?? []

  function updateFilter(patch: Partial<typeof search>) {
    void navigate({ search: (prev) => ({ ...prev, ...patch, page: 0 }) })
  }

  async function run(action: () => Promise<unknown>, done: string) {
    setError(null)
    setMessage(null)
    try {
      await action()
      setMessage(done)
      setPanel(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la operación.')
    }
  }

  async function handleDelete(municipality: MunicipalityAdmin) {
    setError(null)
    setMessage(null)
    try {
      const result = await mutations.remove.mutateAsync(municipality.code)
      setMessage(
        result.outcome === 'DELETED'
          ? `${municipality.name} se eliminó: no lo usaba nadie.`
          : `${municipality.name} quedó retirado: ya se usó en la operación y su historia se conserva.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el municipio.')
    }
  }

  return (
    <div>
      <AdminNav />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-text-primary">Catálogo territorial</h1>
        <Button variant="primary" size="md" onClick={() => setPanel({ kind: 'create' })}>
          Nuevo municipio
        </Button>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-text-secondary">
        Los municipios que ya se usaron en casos, llamadas, reportes o el observatorio no se borran: se retiran. Dejan
        de ofrecerse al abrir un caso y siguen mostrando su nombre en lo que ya pasó.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Buscar
          <Input
            size="sm"
            className="w-56"
            placeholder="Nombre o código"
            defaultValue={search.q ?? ''}
            onBlur={(event) => updateFilter({ q: event.target.value || undefined })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Departamento
          <select
            className={SELECT_CLASS}
            value={search.departamento ?? ''}
            onChange={(event) => updateFilter({ departamento: event.target.value || undefined })}
          >
            <option value="">Todos</option>
            {departmentOptions.map((department) => (
              <option key={department.code} value={department.code}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-[var(--tap-min)] items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            className="h-4 w-4 rounded-xs border-border-strong"
            checked={search.sinGaula ?? false}
            onChange={(event) => updateFilter({ sinGaula: event.target.checked || undefined })}
          />
          Sin GAULA asignado
        </label>
        <label className="flex min-h-[var(--tap-min)] items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            className="h-4 w-4 rounded-xs border-border-strong"
            checked={search.retirados ?? false}
            onChange={(event) => updateFilter({ retirados: event.target.checked || undefined })}
          />
          Incluir retirados
        </label>
      </div>

      {message && (
        <p role="status" className="mt-4 text-sm text-stable">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-critical">
          {error}
        </p>
      )}

      {panel?.kind === 'create' && (
        <MunicipalityForm
          title="Nuevo municipio"
          departments={departmentOptions.map((department) => ({ code: department.code, name: department.name }))}
          onCancel={() => setPanel(null)}
          onSubmit={(values) => run(() => mutations.create.mutateAsync(values), `${values.name} quedó registrado.`)}
        />
      )}
      {panel?.kind === 'edit' && (
        <MunicipalityForm
          title={`Corregir ${panel.municipality.name}`}
          municipality={panel.municipality}
          onCancel={() => setPanel(null)}
          onSubmit={(values) =>
            run(
              () =>
                mutations.correct.mutateAsync({
                  code: panel.municipality.code,
                  version: panel.municipality.version,
                  values,
                }),
              `${values.name} quedó corregido.`,
            )
          }
        />
      )}
      {panel?.kind === 'routing' && (
        <RoutingForm
          municipality={panel.municipality}
          onCancel={() => setPanel(null)}
          onSubmit={(values) =>
            run(
              () => mutations.assignRouting.mutateAsync({ code: panel.municipality.code, ...values }),
              `${panel.municipality.name} queda a cargo de su nuevo GAULA desde ${values.effectiveDate}.`,
            )
          }
        />
      )}

      {municipalities.isLoading && <p className="mt-4 text-sm text-text-secondary">Cargando…</p>}
      {municipalities.isError && (
        <p className="mt-4 text-sm text-critical">No se pudo cargar el catálogo territorial.</p>
      )}

      {!municipalities.isLoading && rows.length === 0 && (
        <EmptyState title="Ningún municipio con estos filtros" description="Cambie la búsqueda o el departamento." />
      )}

      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Municipios del catálogo territorial</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-secondary">
                <th className="py-2 pr-4 font-medium">Código</th>
                <th className="py-2 pr-4 font-medium">Municipio</th>
                <th className="py-2 pr-4 font-medium">Departamento</th>
                <th className="py-2 pr-4 font-medium">GAULA</th>
                <th className="py-2 pr-4 font-medium">Estado</th>
                <th className="py-2 pr-4 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((municipality) => (
                <tr key={municipality.code} className="border-b border-border align-top">
                  <td className="py-2 pr-4 font-mono text-xs text-text-secondary">{municipality.code}</td>
                  <td className="py-2 pr-4 text-text-primary">{municipality.name}</td>
                  <td className="py-2 pr-4 text-text-secondary">{municipality.departmentName}</td>
                  <td className="py-2 pr-4">
                    {municipality.territorialUnitName ?? <span className="text-alert">Sin asignar</span>}
                  </td>
                  <td className="py-2 pr-4">
                    <Badge tone={municipality.retiredAt ? 'neutral' : 'active'}>
                      {municipality.retiredAt ? 'Retirado' : 'Vigente'}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setPanel({ kind: 'edit', municipality })}>
                        Corregir
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setPanel({ kind: 'routing', municipality })}>
                        Asignar GAULA
                      </Button>
                      {municipality.retiredAt ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            run(
                              () => mutations.reactivate.mutateAsync(municipality.code),
                              `${municipality.name} vuelve a estar vigente.`,
                            )
                          }
                        >
                          Reactivar
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            run(
                              () =>
                                mutations.retire.mutateAsync({
                                  code: municipality.code,
                                  note: 'Retirado desde la administración del catálogo.',
                                }),
                              `${municipality.name} quedó retirado.`,
                            )
                          }
                        >
                          Retirar
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => void handleDelete(municipality)}>
                        Eliminar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > SIZE && (
        <div className="mt-3 flex items-center gap-3 text-sm text-text-secondary">
          <Button
            variant="ghost"
            size="sm"
            disabled={(search.page ?? 0) === 0}
            onClick={() => void navigate({ search: (prev) => ({ ...prev, page: Math.max(0, (prev.page ?? 0) - 1) }) })}
          >
            Anterior
          </Button>
          <span>
            {(search.page ?? 0) * SIZE + 1}–{Math.min(((search.page ?? 0) + 1) * SIZE, total)} de {total}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={((search.page ?? 0) + 1) * SIZE >= total}
            onClick={() => void navigate({ search: (prev) => ({ ...prev, page: (prev.page ?? 0) + 1 }) })}
          >
            Siguiente
          </Button>
        </div>
      )}
    </div>
  )
}

interface FormValues {
  code?: string
  departmentCode?: string
  name: string
  population?: number | null
  latitude?: number | null
  longitude?: number | null
}

function MunicipalityForm({
  title,
  municipality,
  departments,
  onCancel,
  onSubmit,
}: {
  title: string
  municipality?: MunicipalityAdmin
  departments?: { code: string; name: string }[]
  onCancel: () => void
  onSubmit: (values: FormValues) => void
}) {
  const [code, setCode] = useState(municipality?.code ?? '')
  const [departmentCode, setDepartmentCode] = useState(municipality?.departmentCode ?? '')
  const [name, setName] = useState(municipality?.name ?? '')
  const [population, setPopulation] = useState(municipality?.population?.toString() ?? '')
  const [latitude, setLatitude] = useState(municipality?.latitude?.toString() ?? '')
  const [longitude, setLongitude] = useState(municipality?.longitude?.toString() ?? '')
  const creating = municipality === undefined

  return (
    <form
      className="mt-4 flex flex-col gap-3 rounded-sm border border-border bg-surface-raised p-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit({
          ...(creating ? { code, departmentCode } : {}),
          name,
          population: population === '' ? null : Number(population),
          latitude: latitude === '' ? null : Number(latitude),
          longitude: longitude === '' ? null : Number(longitude),
        })
      }}
    >
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>

      {creating && (
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm text-text-primary">
            Código DIVIPOLA *
            <Input
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="w-32"
              inputMode="numeric"
              placeholder="94343"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-primary">
            Departamento *
            <select
              required
              value={departmentCode}
              onChange={(event) => setDepartmentCode(event.target.value)}
              className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
            >
              <option value="">Seleccione…</option>
              {(departments ?? []).map((department) => (
                <option key={department.code} value={department.code}>
                  {department.name} ({department.code})
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Nombre *
          <Input required value={name} onChange={(event) => setName(event.target.value)} className="w-64" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Población
          <Input
            value={population}
            onChange={(event) => setPopulation(event.target.value)}
            className="w-32"
            inputMode="numeric"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Latitud
          <Input value={latitude} onChange={(event) => setLatitude(event.target.value)} className="w-32" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Longitud
          <Input value={longitude} onChange={(event) => setLongitude(event.target.value)} className="w-32" />
        </label>
      </div>
      <p className="text-xs text-text-secondary">
        El punto se guarda completo o no se guarda: sin las dos coordenadas, el municipio queda sin ubicación en el
        mapa.
      </p>

      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm">
          Guardar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

function RoutingForm({
  municipality,
  onCancel,
  onSubmit,
}: {
  municipality: MunicipalityAdmin
  onCancel: () => void
  onSubmit: (values: { territorialUnitId: string; effectiveDate: string; sourceDocument?: string | undefined }) => void
}) {
  const units = useTerritorialUnitOptions()
  const [territorialUnitId, setTerritorialUnitId] = useState(municipality.territorialUnitId ?? '')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [sourceDocument, setSourceDocument] = useState('')

  return (
    <form
      className="mt-4 flex flex-col gap-3 rounded-sm border border-border bg-surface-raised p-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit({ territorialUnitId, effectiveDate, sourceDocument: sourceDocument || undefined })
      }}
    >
      <h2 className="text-sm font-semibold text-text-primary">Asignar GAULA a {municipality.name}</h2>
      <p className="text-xs text-text-secondary">
        La asignación anterior no se borra: se cierra en esta fecha y empieza la nueva.
        {municipality.territorialUnitName
          ? ` Hoy lo atiende ${municipality.territorialUnitName}.`
          : ' Hoy no tiene ninguno asignado.'}
      </p>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          GAULA territorial *
          <select
            required
            value={territorialUnitId}
            onChange={(event) => setTerritorialUnitId(event.target.value)}
            className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
          >
            <option value="">Seleccione…</option>
            {(units.data ?? []).map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Rige desde *
          <Input
            required
            type="date"
            value={effectiveDate}
            onChange={(event) => setEffectiveDate(event.target.value)}
            className="w-44"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Documento que lo ordena
          <Input
            value={sourceDocument}
            onChange={(event) => setSourceDocument(event.target.value)}
            className="w-64"
            placeholder="Directiva 034/2026"
          />
        </label>
      </div>

      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm">
          Asignar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
