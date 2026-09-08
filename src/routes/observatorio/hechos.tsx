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
  formForProfile,
  latestProfile,
  tableFieldsOf,
  useImportProfiles,
} from '@/lib/observatory/useImportProfiles'
import {
  KIDNAPPING_TYPE_LABEL,
  MODALITY_LABEL,
  PROFILE_LABEL,
  VICTIM_STATUS_LABEL,
  type CrimeIncident,
  type FormField,
  type IncidentPage,
  type IncidentProfile,
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
  const declaredFields = tableFieldsOf(latestProfile(useImportProfiles().data))
  // Mismo respaldo que el formulario: con un perfil anterior a SPEC-0806, o si la
  // consulta de perfiles falla, la tabla conserva sus columnas en vez de quedarse
  // en una fecha y un delito.
  const profileFields = declaredFields.length > 0 ? declaredFields : FALLBACK_TABLE_FIELDS
  const [showCapture, setShowCapture] = useState(false)
  const [correcting, setCorrecting] = useState<CrimeIncident | null>(null)

  // SPEC-0806 CA-3: la tabla se dibuja con los MISMOS campos del perfil que el
  // formulario, en el orden y con las etiquetas de la hoja. Antes tenía una
  // columna «Tipo / situación» que juntaba dos columnas del Excel y escondía
  // OCUPACIÓN: quien viene del archivo no reconocía su propio registro.
  const columns: ColumnDef<CrimeIncident, unknown>[] = [
    {
      id: 'profile',
      accessorKey: 'profile',
      header: 'Delito',
      // En el libro esto es la HOJA; aquí las dos van en una sola tabla, así que
      // hay que decir de cuál viene cada fila.
      cell: ({ getValue }) => PROFILE_LABEL[getValue<IncidentProfile>()] ?? '—',
    },
    ...profileFields.map((field) => incidentColumn(field)),
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

/**
 * Una columna de la tabla a partir de un campo del perfil. Los códigos tipados
 * se leen del hecho; todo lo demás sale de `attributes`, que es donde viven las
 * columnas declaradas (SPEC-0806).
 */
function incidentColumn(field: FormField): ColumnDef<CrimeIncident, unknown> {
  return {
    id: field.dynamic ? `attr:${field.code}` : field.code,
    header: field.label,
    cell: ({ row }) => renderIncidentValue(field, row.original),
  }
}

function renderIncidentValue(field: FormField, incident: CrimeIncident) {
  if (field.dynamic) return incident.attributes?.[field.code] || '—'

  switch (field.code) {
    case 'occurredOn':
      return incident.occurredOn
    case 'departmentText':
      return incident.departmentText
    case 'municipalityText':
      // SPEC-0801 CA-3: el texto original SIEMPRE visible junto al código resuelto.
      return (
        <span className="flex items-center gap-2">
          {incident.municipalityText}
          {incident.municipalityUnresolved ? (
            <Badge tone="alert">
              <AlertTriangle size={11} strokeWidth={2} aria-hidden /> sin resolver
            </Badge>
          ) : (
            <span className="font-mono text-2xs text-text-muted">{incident.municipalityCode}</span>
          )}
        </span>
      )
    case 'authorGroup':
      return incident.authorGroup
    case 'occupation':
      return incident.occupation || '—'
    case 'notes':
      return incident.notes || '—'
    case 'kidnappingType':
      return incident.kidnappingType ? KIDNAPPING_TYPE_LABEL[incident.kidnappingType] : '—'
    case 'victimStatus':
      return incident.victimStatus ? VICTIM_STATUS_LABEL[incident.victimStatus] : '—'
    case 'modality':
      return incident.modality ? MODALITY_LABEL[incident.modality] : '—'
    default:
      // Un campo tipado que esta consola todavía no sabe pintar: se dice, en vez
      // de dejar una columna en blanco que parece un dato faltante.
      return <span className="text-text-muted">sin representar</span>
  }
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

/**
 * SPEC-0806 CA-1: el formulario NO está escrito a mano aquí. Se dibuja con los
 * `formFields` del perfil vigente, así que tiene las mismas columnas, en el
 * mismo orden y con las mismas etiquetas de la hoja del Excel que el analista
 * llena hoy. Agregar una columna es publicar una versión nueva del perfil
 * (CA-2), no desplegar frontend.
 *
 * El respaldo de abajo sólo entra si el perfil es anterior a SPEC-0806 (sin
 * `formFields`) o si la consulta de perfiles falla: preferimos un formulario
 * mínimo usable a una pantalla en blanco.
 */
const FALLBACK_FIELDS: Record<IncidentProfile, FormField[]> = {
  KIDNAPPING: [
    { code: 'occurredOn', label: 'FECHA', type: 'DATE', required: true, dynamic: false, options: [] },
    {
      code: 'kidnappingType',
      label: 'TIPO SECUESTRO',
      type: 'ENUM',
      required: false,
      dynamic: false,
      options: Object.entries(KIDNAPPING_TYPE_LABEL).map(([value, label]) => ({ value, label })),
    },
    { code: 'departmentText', label: 'DEPARTAMENTO', type: 'TEXT', required: true, dynamic: false, options: [] },
    { code: 'municipalityText', label: 'MUNICIPIO', type: 'TEXT', required: true, dynamic: false, options: [] },
    {
      code: 'victimStatus',
      label: 'SITUACIÓN',
      type: 'ENUM',
      required: false,
      dynamic: false,
      options: Object.entries(VICTIM_STATUS_LABEL).map(([value, label]) => ({ value, label })),
    },
    { code: 'occupation', label: 'OCUPACIÓN', type: 'TEXT', required: false, dynamic: false, options: [] },
    { code: 'authorGroup', label: 'AUTOR', type: 'TEXT', required: true, dynamic: false, options: [] },
    { code: 'notes', label: 'Nota', type: 'TEXT', required: false, dynamic: false, options: [] },
  ],
  EXTORTION: [
    { code: 'occurredOn', label: 'FECHA', type: 'DATE', required: true, dynamic: false, options: [] },
    { code: 'departmentText', label: 'DEPARTAMENTO', type: 'TEXT', required: true, dynamic: false, options: [] },
    { code: 'municipalityText', label: 'MUNICIPIO', type: 'TEXT', required: true, dynamic: false, options: [] },
    {
      code: 'modality',
      label: 'MODALIDAD',
      type: 'ENUM',
      required: false,
      dynamic: false,
      options: Object.entries(MODALITY_LABEL).map(([value, label]) => ({ value, label })),
    },
    { code: 'authorGroup', label: 'AUTOR', type: 'TEXT', required: true, dynamic: false, options: [] },
    { code: 'notes', label: 'Nota', type: 'TEXT', required: false, dynamic: false, options: [] },
  ],
}

/** El respaldo de la tabla: los campos de las dos hojas, sin repetir. */
const FALLBACK_TABLE_FIELDS: FormField[] = [
  ...FALLBACK_FIELDS.KIDNAPPING,
  ...FALLBACK_FIELDS.EXTORTION.filter(
    (field) => !FALLBACK_FIELDS.KIDNAPPING.some((kidnapping) => kidnapping.code === field.code),
  ),
]

/** Los códigos que tienen columna tipada propia; todo lo demás viaja en `attributes`. */
const TYPED_CODES = new Set([
  'occurredOn',
  'departmentText',
  'municipalityText',
  'authorGroup',
  'kidnappingType',
  'victimStatus',
  'occupation',
  'modality',
  'notes',
])

type CaptureValues = Record<string, string>

/**
 * SPEC-0802 Vía B: capturar un hecho DIRECTAMENTE, sin pasar por el Excel.
 * El hecho cuelga del corte vigente (el backend lo resuelve si no se manda
 * `snapshotId`).
 */
function CaptureIncidentForm({ onDone }: { onDone: () => void }) {
  const invalidate = useInvalidateIncidents()
  const profiles = useImportProfiles()
  const profile = latestProfile(profiles.data)
  const [incidentProfile, setIncidentProfile] = useState<IncidentProfile>('KIDNAPPING')
  const [values, setValues] = useState<CaptureValues>({})

  const sheetForm = formForProfile(profile, incidentProfile)
  const fields = sheetForm?.fields.length ? sheetForm.fields : FALLBACK_FIELDS[incidentProfile]

  const mutation = useMutation({
    mutationFn: () => {
      const attributes: Record<string, string> = {}
      for (const field of fields) {
        const value = values[field.code]?.trim()
        // Un código que no es dinámico PERO tampoco tiene columna tipada sólo
        // puede venir de un perfil más nuevo que esta consola: se guarda como
        // atributo en vez de perderse en silencio.
        if (value && (field.dynamic || !TYPED_CODES.has(field.code))) attributes[field.code] = value
      }
      const typed = (code: string) => values[code]?.trim() || null
      return customFetch<CrimeIncident>('/api/v1/observatory/incidents', {
        method: 'POST',
        body: JSON.stringify({
          profile: incidentProfile,
          occurredOn: values.occurredOn ?? '',
          departmentText: values.departmentText?.trim() ?? '',
          municipalityText: values.municipalityText?.trim() ?? '',
          authorGroup: values.authorGroup?.trim() ?? '',
          kidnappingType: incidentProfile === 'KIDNAPPING' ? typed('kidnappingType') : null,
          victimStatus: incidentProfile === 'KIDNAPPING' ? typed('victimStatus') : null,
          occupation: typed('occupation'),
          modality: incidentProfile === 'EXTORTION' ? typed('modality') : null,
          notes: typed('notes'),
          attributes,
        }),
      })
    },
    onSuccess: async () => {
      await invalidate()
      setValues({})
      onDone()
    },
  })

  const complete = fields.every((field) => !field.required || (values[field.code]?.trim() ?? '') !== '')
  const dynamicCount = fields.filter((field) => field.dynamic).length

  return (
    <section className="mt-4 rounded-sm border border-border-strong bg-surface-raised p-3 sm:p-4">
      <h2 className="text-sm font-semibold text-text-primary">Registrar hecho directamente</h2>
      <p className="mt-1 text-2xs text-text-muted">
        Mismas columnas, mismo orden y mismas etiquetas que la hoja «{sheetForm?.sheetName ?? incidentProfile}» del
        archivo. Queda en el corte vigente, igual que si hubiera venido cargado. El municipio se resuelve contra el
        catálogo; si no resuelve, el hecho se guarda con el texto tal cual y queda marcado para corregir.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-2xs uppercase tracking-wide text-text-secondary">Delito (hoja)</span>
          <select
            aria-label="Delito del hecho"
            value={incidentProfile}
            onChange={(event) => {
              setIncidentProfile(event.target.value as IncidentProfile)
              setValues({})
            }}
            className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
          >
            {PROFILES.map((value) => (
              <option key={value} value={value}>
                {PROFILE_LABEL[value]}
              </option>
            ))}
          </select>
        </label>

        {fields.map((field) => (
          <CaptureField
            key={field.code}
            field={field}
            value={values[field.code] ?? ''}
            onChange={(value) => setValues((current) => ({ ...current, [field.code]: value }))}
          />
        ))}
      </div>

      <p className="mt-3 text-2xs text-text-muted">
        {dynamicCount > 0
          ? `${dynamicCount === 1 ? 'Una de estas columnas está declarada' : `${dynamicCount} de estas columnas están declaradas`} en el perfil ${profile?.code ?? ''} v${profile?.version ?? ''}, no en el código.`
          : 'Este perfil no declara columnas adicionales.'}{' '}
        Para agregar otra columna del archivo se publica una versión nueva del perfil y aparece aquí, en la carga y en
        la tabla sin desplegar la consola (SPEC-0806 CA-2).
      </p>

      {mutation.isError && (
        <p className="mt-2 text-sm text-critical" role="alert">
          {mutation.error instanceof Error ? mutation.error.message : 'No se pudo registrar el hecho.'}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={!complete}
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Registrar
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </section>
  )
}

/** Un campo del perfil. La etiqueta va tal cual viene del Excel, en mayúscula fija como el encabezado de la hoja. */
function CaptureField({
  field,
  value,
  onChange,
}: {
  field: FormField
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="font-mono text-2xs uppercase tracking-wide text-text-secondary">
        {field.label}
        {field.required && <span className="text-critical"> *</span>}
        {field.dynamic && (
          <span className="ml-1 font-sans normal-case text-text-muted" title="Columna declarada en el perfil">
            {' '}
            (columna del perfil)
          </span>
        )}
      </span>
      {field.type === 'ENUM' ? (
        <select
          aria-label={field.label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
        >
          <option value="">Sin dato</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          type={field.type === 'DATE' ? 'date' : 'text'}
          aria-label={field.label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  )
}
