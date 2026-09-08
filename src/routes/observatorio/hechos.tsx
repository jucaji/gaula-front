import { createFileRoute, redirect } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { z } from 'zod'
import { AlertTriangle } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { customFetch } from '@/api/client'
import type { MunicipalityResponse } from '@/api/generated/models'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import { Badge } from '@/design-system/primitives/Badge'
import { DataTable } from '@/design-system/primitives/DataTable'
import { EmptyState } from '@/design-system/patterns/EmptyState'
import { ObservatoryNav } from '@/design-system/patterns/ObservatoryNav'
import { ACTIVE_SNAPSHOT_KEY } from '@/lib/observatory/useActiveSnapshot'
import {
  KIDNAPPING_TYPE_LABEL,
  MODALITY_LABEL,
  PROFILE_LABEL,
  VICTIM_STATUS_LABEL,
  type CrimeIncident,
  type ExtortionModality,
  type IncidentPage,
  type IncidentProfile,
  type KidnappingType,
  type VictimStatus,
} from '@/lib/observatory/types'

const PROFILES = ['EXTORTION', 'KIDNAPPING'] as const

const incidentSearchSchema = z.object({
  page: z.number().catch(0),
  size: z.number().catch(50),
  profile: z.enum(PROFILES).optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  municipalityCode: z.string().optional().catch(undefined),
  authorGroup: z.string().optional().catch(undefined),
  onlyUnresolved: z.boolean().catch(false),
})

type IncidentSearch = z.infer<typeof incidentSearchSchema>

export const Route = createFileRoute('/observatorio/hechos')({
  validateSearch: incidentSearchSchema,
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'OBSERVATORY')) {
      throw redirect({ to: '/', search: { denied: 'OBSERVATORY' } })
    }
  },
  component: ObservatoryIncidentsPage,
})

function useIncidents(search: IncidentSearch) {
  return useQuery({
    queryKey: ['observatory', 'incidents', search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(search.page), size: String(search.size) })
      if (search.profile) params.set('profile', search.profile)
      if (search.from) params.set('from', search.from)
      if (search.to) params.set('to', search.to)
      if (search.municipalityCode) params.set('municipalityCode', search.municipalityCode)
      if (search.authorGroup) params.set('authorGroup', search.authorGroup)
      if (search.onlyUnresolved) params.set('onlyUnresolved', 'true')
      return customFetch<IncidentPage>(`/api/v1/observatory/incidents?${params.toString()}`)
    },
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

/**
 * S13.FE.02 -- la tabla del registro nacional, con las DOS vías de trabajo del
 * analista sobre el MISMO agregado: capturar un hecho a mano (Vía B) y
 * corregir en línea el municipio que la carga no pudo resolver, sin volver al
 * Excel ni recargar el archivo (SPEC-0802 CA-3).
 */
function ObservatoryIncidentsPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data, isLoading, isError, error } = useIncidents(search)
  const canWrite = Route.useRouteContext().can('CREATE', 'OBSERVATORY')
  const [showCapture, setShowCapture] = useState(false)
  const [correcting, setCorrecting] = useState<CrimeIncident | null>(null)

  const columns: ColumnDef<CrimeIncident, unknown>[] = [
    { id: 'occurredOn', accessorKey: 'occurredOn', header: 'Fecha' },
    {
      id: 'profile',
      accessorKey: 'profile',
      header: 'Delito',
      cell: ({ getValue }) => PROFILE_LABEL[getValue<IncidentProfile>()] ?? '—',
    },
    { id: 'departmentText', accessorKey: 'departmentText', header: 'Departamento' },
    {
      id: 'municipalityText',
      header: 'Municipio',
      // SPEC-0801 CA-3: el texto original SIEMPRE visible junto al código resuelto.
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          {row.original.municipalityText}
          {row.original.municipalityUnresolved ? (
            <Badge tone="alert">
              <AlertTriangle size={11} strokeWidth={2} aria-hidden /> sin resolver
            </Badge>
          ) : (
            <span className="font-mono text-2xs text-text-muted">{row.original.municipalityCode}</span>
          )}
        </span>
      ),
    },
    { id: 'authorGroup', accessorKey: 'authorGroup', header: 'Autor' },
    {
      id: 'detail',
      header: 'Tipo / situación',
      cell: ({ row }) =>
        row.original.profile === 'KIDNAPPING'
          ? [
              row.original.kidnappingType ? KIDNAPPING_TYPE_LABEL[row.original.kidnappingType] : null,
              row.original.victimStatus ? VICTIM_STATUS_LABEL[row.original.victimStatus] : null,
            ]
              .filter(Boolean)
              .join(' · ') || '—'
          : row.original.modality
            ? MODALITY_LABEL[row.original.modality]
            : '—',
    },
    {
      id: 'sourceRowNumber',
      accessorKey: 'sourceRowNumber',
      header: 'Fila del archivo',
      // Sin origen, capturado a mano por la Vía B: decirlo es parte del dato.
      cell: ({ getValue }) => getValue<number | null>() ?? 'captura directa',
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) =>
        canWrite && row.original.municipalityUnresolved ? (
          <Button variant="ghost" size="sm" onClick={() => setCorrecting(row.original)}>
            Corregir municipio
          </Button>
        ) : null,
    },
  ]

  const incidents = data?.content ?? []

  return (
    <div className="flex h-full flex-col">
      <ObservatoryNav />

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Hechos del registro nacional</h1>
        {canWrite && (
          <Button variant="primary" size="md" onClick={() => setShowCapture((value) => !value)}>
            Registrar hecho
          </Button>
        )}
      </div>

      {showCapture && <CaptureIncidentForm onDone={() => setShowCapture(false)} />}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Delito
          <select
            aria-label="Delito"
            value={search.profile ?? ''}
            onChange={(event) =>
              void navigate({
                search: { ...search, page: 0, profile: (event.target.value || undefined) as IncidentProfile },
              })
            }
            className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
          >
            <option value="">Todos</option>
            {PROFILES.map((profile) => (
              <option key={profile} value={profile}>
                {PROFILE_LABEL[profile]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Desde
          <Input
            type="date"
            value={search.from ?? ''}
            onChange={(event) => void navigate({ search: { ...search, page: 0, from: event.target.value || undefined } })}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Hasta
          <Input
            type="date"
            value={search.to ?? ''}
            onChange={(event) => void navigate({ search: { ...search, page: 0, to: event.target.value || undefined } })}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Autor
          <Input
            value={search.authorGroup ?? ''}
            placeholder="GDCO, ELN…"
            onChange={(event) =>
              void navigate({ search: { ...search, page: 0, authorGroup: event.target.value || undefined } })
            }
          />
        </label>

        <label className="flex items-center gap-2 pb-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={search.onlyUnresolved}
            onChange={(event) => void navigate({ search: { ...search, page: 0, onlyUnresolved: event.target.checked } })}
          />
          Sólo municipios sin resolver
        </label>
      </div>

      {isError && (
        <p className="mt-4 text-sm text-critical" role="alert">
          {error instanceof Error ? error.message : 'No se pudieron consultar los hechos.'}
        </p>
      )}

      {!isLoading && !isError && incidents.length === 0 && (
        <EmptyState
          title="No hay hechos con estos filtros"
          description={
            search.onlyUnresolved
              ? 'Ningún hecho del corte vigente quedó con el municipio sin resolver.'
              : 'Cargue la plantilla del registro nacional o registre un hecho a mano.'
          }
        />
      )}

      {incidents.length > 0 && (
        <>
          <div className="mt-3 min-h-0 flex-1">
            <DataTable data={incidents} columns={columns} getRowId={(row) => row.id} />
          </div>
          <div className="mt-2 flex items-center gap-3 text-2xs text-text-secondary">
            <span>
              {data?.totalElements.toLocaleString('es-CO')} hechos · página {(data?.pageNumber ?? 0) + 1} de{' '}
              {data?.totalPages ?? 1}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={search.page === 0}
              onClick={() => void navigate({ search: { ...search, page: search.page - 1 } })}
            >
              Anterior
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={(data?.pageNumber ?? 0) + 1 >= (data?.totalPages ?? 1)}
              onClick={() => void navigate({ search: { ...search, page: search.page + 1 } })}
            >
              Siguiente
            </Button>
          </div>
        </>
      )}

      {correcting && <ResolveMunicipalityDialog incident={correcting} onClose={() => setCorrecting(null)} />}
    </div>
  )
}

function useInvalidateIncidents() {
  const queryClient = useQueryClient()
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ['observatory', 'incidents'] })
    await queryClient.invalidateQueries({ queryKey: ACTIVE_SNAPSHOT_KEY })
  }
}

/** SPEC-0802 CA-3: buscar el municipio en el catálogo y fijarlo, sin tocar el texto original del archivo. */
function ResolveMunicipalityDialog({ incident, onClose }: { incident: CrimeIncident; onClose: () => void }) {
  const invalidate = useInvalidateIncidents()
  const [query, setQuery] = useState(incident.municipalityText)
  const [code, setCode] = useState('')

  const municipalities = useQuery({
    queryKey: ['catalog', 'municipalities', query],
    queryFn: () =>
      customFetch<MunicipalityResponse[]>(`/api/v1/catalog/municipalities?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length >= 2,
    networkMode: 'always',
    retry: false,
  })

  const mutation = useMutation({
    mutationFn: () =>
      customFetch<CrimeIncident>(`/api/v1/observatory/incidents/${incident.id}/municipality`, {
        method: 'PATCH',
        body: JSON.stringify({ municipalityCode: code }),
      }),
    onSuccess: async () => {
      await invalidate()
      onClose()
    },
  })

  return (
    <div className="mt-4 max-w-2xl rounded-sm border border-border-strong bg-surface-raised p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Corregir municipio</h2>
        <button type="button" onClick={onClose} className="text-2xs text-text-muted hover:text-text-primary">
          Cerrar
        </button>
      </div>
      <p className="mt-1 text-2xs text-text-muted">
        El archivo dice «{incident.departmentText} — {incident.municipalityText}». El texto original se conserva; sólo
        se fija a qué municipio del catálogo corresponde.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Buscar municipio
          <Input value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Municipio del catálogo
          <select
            aria-label="Municipio del catálogo"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
          >
            <option value="">Seleccione…</option>
            {municipalities.data?.map((municipality) => (
              <option key={municipality.code} value={municipality.code}>
                {municipality.name} — {municipality.departmentName} ({municipality.code})
              </option>
            ))}
          </select>
        </label>
      </div>

      {mutation.isError && (
        <p className="mt-2 text-sm text-critical" role="alert">
          {mutation.error instanceof Error ? mutation.error.message : 'No se pudo corregir el municipio.'}
        </p>
      )}

      <Button
        className="mt-3"
        variant="primary"
        size="sm"
        disabled={!code}
        loading={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Guardar municipio
      </Button>
    </div>
  )
}

interface CaptureForm {
  profile: IncidentProfile
  occurredOn: string
  departmentText: string
  municipalityText: string
  authorGroup: string
  kidnappingType: KidnappingType | ''
  victimStatus: VictimStatus | ''
  occupation: string
  modality: ExtortionModality | ''
  notes: string
}

const EMPTY_CAPTURE: CaptureForm = {
  profile: 'KIDNAPPING',
  occurredOn: '',
  departmentText: '',
  municipalityText: '',
  authorGroup: '',
  kidnappingType: '',
  victimStatus: '',
  occupation: '',
  modality: '',
  notes: '',
}

/**
 * SPEC-0802 Vía B: capturar un hecho DIRECTAMENTE, sin pasar por el Excel.
 * Es la mitad que hoy no existe -- si llega un dato suelto, el analista tiene
 * que editar el archivo y recargarlo entero. El hecho cuelga del corte vigente
 * (el backend lo resuelve si no se manda `snapshotId`).
 */
function CaptureIncidentForm({ onDone }: { onDone: () => void }) {
  const invalidate = useInvalidateIncidents()
  const [form, setForm] = useState<CaptureForm>(EMPTY_CAPTURE)

  const mutation = useMutation({
    mutationFn: () =>
      customFetch<CrimeIncident>('/api/v1/observatory/incidents', {
        method: 'POST',
        body: JSON.stringify({
          profile: form.profile,
          occurredOn: form.occurredOn,
          departmentText: form.departmentText,
          municipalityText: form.municipalityText,
          authorGroup: form.authorGroup,
          kidnappingType: form.profile === 'KIDNAPPING' ? form.kidnappingType || null : null,
          victimStatus: form.profile === 'KIDNAPPING' ? form.victimStatus || null : null,
          occupation: form.occupation || null,
          modality: form.profile === 'EXTORTION' ? form.modality || null : null,
          notes: form.notes || null,
        }),
      }),
    onSuccess: async () => {
      await invalidate()
      setForm(EMPTY_CAPTURE)
      onDone()
    },
  })

  const complete =
    form.occurredOn && form.departmentText.trim() && form.municipalityText.trim() && form.authorGroup.trim()

  return (
    <section className="mt-4 max-w-3xl rounded-sm border border-border-strong bg-surface-raised p-4">
      <h2 className="text-sm font-semibold text-text-primary">Registrar hecho directamente</h2>
      <p className="mt-1 text-2xs text-text-muted">
        Queda en el corte vigente, igual que si hubiera venido en el archivo. El municipio se resuelve contra el
        catálogo; si no resuelve, el hecho se guarda con el texto tal cual y queda marcado para corregir.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Delito
          <select
            aria-label="Delito del hecho"
            value={form.profile}
            onChange={(event) => setForm({ ...form, profile: event.target.value as IncidentProfile })}
            className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
          >
            {PROFILES.map((profile) => (
              <option key={profile} value={profile}>
                {PROFILE_LABEL[profile]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Fecha del hecho
          <Input
            type="date"
            value={form.occurredOn}
            onChange={(event) => setForm({ ...form, occurredOn: event.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Departamento
          <Input
            value={form.departmentText}
            onChange={(event) => setForm({ ...form, departmentText: event.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Municipio
          <Input
            value={form.municipalityText}
            onChange={(event) => setForm({ ...form, municipalityText: event.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Autor
          <Input
            value={form.authorGroup}
            placeholder="GDCO, ELN, DELINCUENCIA COMÚN…"
            onChange={(event) => setForm({ ...form, authorGroup: event.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Ocupación de la víctima
          <Input value={form.occupation} onChange={(event) => setForm({ ...form, occupation: event.target.value })} />
        </label>

        {form.profile === 'KIDNAPPING' ? (
          <>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              Tipo de secuestro
              <select
                aria-label="Tipo de secuestro"
                value={form.kidnappingType}
                onChange={(event) => setForm({ ...form, kidnappingType: event.target.value as KidnappingType })}
                className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
              >
                <option value="">Sin dato</option>
                {Object.entries(KIDNAPPING_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              Situación de la víctima
              <select
                aria-label="Situación de la víctima"
                value={form.victimStatus}
                onChange={(event) => setForm({ ...form, victimStatus: event.target.value as VictimStatus })}
                className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
              >
                <option value="">Sin dato</option>
                {Object.entries(VICTIM_STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Modalidad
            <select
              aria-label="Modalidad"
              value={form.modality}
              onChange={(event) => setForm({ ...form, modality: event.target.value as ExtortionModality })}
              className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
            >
              <option value="">Sin dato</option>
              {Object.entries(MODALITY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <label className="mt-3 flex flex-col gap-1 text-xs text-text-secondary">
        Observaciones
        <Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      </label>

      {mutation.isError && (
        <p className="mt-2 text-sm text-critical" role="alert">
          {mutation.error instanceof Error ? mutation.error.message : 'No se pudo registrar el hecho.'}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button variant="primary" size="sm" disabled={!complete} loading={mutation.isPending} onClick={() => mutation.mutate()}>
          Registrar
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </section>
  )
}
