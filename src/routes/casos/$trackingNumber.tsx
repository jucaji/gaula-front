import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { customFetch } from '@/api/client'
import { ApiError } from '@/api/problem'
import type {
  CaseActionResponse,
  CaseFileResponse,
  EvidenceResponse,
  PersonOfInterestResponse,
  TimelineEntryResponse,
} from '@/api/generated/models'
import { TrackingNumberBadge } from '@/design-system/domain/TrackingNumberBadge'
import { CaseStatusChip } from '@/design-system/domain/CaseStatusChip'
import { PriorityIndicator } from '@/design-system/domain/PriorityIndicator'
import { ClassificationBanner } from '@/design-system/domain/ClassificationBanner'
import { CaseTimeline } from '@/design-system/domain/CaseTimeline'
import { EvidenceCard } from '@/design-system/domain/EvidenceCard'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import { uploadFileWithProgress, type UploadHandle } from '@/lib/upload/uploadWithProgress'
import { formatDateTime } from '@/lib/format/formatDateTime'

export const Route = createFileRoute('/casos/$trackingNumber')({
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'CASE_FILE')) {
      throw redirect({ to: '/', search: { denied: 'CASE_FILE' } })
    }
  },
  component: CaseDetailPage,
})

/**
 * Espejo de CaseStatus.canTransitionTo() (backend, docs/12 S2.DOM.02) --
 * UX ONLY, nunca la barrera real: el backend rechaza igual una transición
 * inválida aunque este mapa quede desactualizado (mismo criterio que
 * lib/permissions.ts).
 */
const NEXT_STATUSES: Record<string, string[]> = {
  RECEIVED: ['UNDER_VERIFICATION', 'CLOSED_WITHOUT_MERIT'],
  UNDER_VERIFICATION: ['IN_OPERATION', 'CLOSED_WITHOUT_MERIT'],
  IN_OPERATION: ['RESULT_RECORDED', 'CLOSED_WITHOUT_MERIT'],
  RESULT_RECORDED: ['PROSECUTED', 'CLOSED', 'CLOSED_WITHOUT_MERIT'],
  PROSECUTED: ['CLOSED', 'CLOSED_WITHOUT_MERIT'],
  CLOSED: [],
  CLOSED_WITHOUT_MERIT: [],
}

const EVIDENCE_TYPES = ['PHOTO', 'VIDEO', 'AUDIO', 'DOCUMENT', 'SCREENSHOT', 'CDR'] as const
const ACTION_TYPES = ['VERIFICATION', 'FIELD_OPERATION', 'INTERVIEW', 'EXTERNAL_REQUEST', 'LEGAL_NOTIFICATION', 'NOTE'] as const
const PARTY_ROLES = ['VICTIM', 'SUSPECT', 'WITNESS', 'RELATIVE'] as const

type Tab = 'resumen' | 'timeline' | 'evidencia' | 'personas' | 'actuaciones'
const TABS: { id: Tab; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'timeline', label: 'Línea de tiempo' },
  { id: 'evidencia', label: 'Evidencia' },
  { id: 'personas', label: 'Personas' },
  { id: 'actuaciones', label: 'Actuaciones' },
]

function useCaseFile(trackingNumber: string) {
  return useQuery({
    queryKey: ['case-files', 'detail', trackingNumber],
    queryFn: () => customFetch<CaseFileResponse>(`/api/v1/case-files/${trackingNumber}`),
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

function useTimeline(trackingNumber: string, enabled: boolean) {
  return useQuery({
    queryKey: ['case-files', 'timeline', trackingNumber],
    queryFn: () => customFetch<TimelineEntryResponse[]>(`/api/v1/case-files/${trackingNumber}/timeline`),
    enabled,
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

function useEvidenceList(trackingNumber: string, enabled: boolean) {
  return useQuery({
    queryKey: ['case-files', 'evidence', trackingNumber],
    queryFn: () => customFetch<EvidenceResponse[]>(`/api/v1/case-files/${trackingNumber}/evidence`),
    enabled,
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

function usePersons(trackingNumber: string, enabled: boolean) {
  return useQuery({
    queryKey: ['case-files', 'persons', trackingNumber],
    queryFn: () => customFetch<PersonOfInterestResponse[]>(`/api/v1/case-files/${trackingNumber}/persons`),
    enabled,
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

function useActions(trackingNumber: string, enabled: boolean) {
  return useQuery({
    queryKey: ['case-files', 'actions', trackingNumber],
    queryFn: () => customFetch<CaseActionResponse[]>(`/api/v1/case-files/${trackingNumber}/actions`),
    enabled,
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

function CaseDetailPage() {
  const { trackingNumber } = Route.useParams()
  const { can } = Route.useRouteContext()
  const canUpdate = can('UPDATE', 'CASE_FILE')
  // S3.ADI.01, hallazgo en vivo: adjuntar evidencia exige CREATE en el
  // backend (EvidenceController), no UPDATE -- distinto de actuaciones y
  // personas, que sí piden UPDATE. INTELLIGENCE_ANALYST tiene UPDATE pero
  // NO CREATE sobre CASE_FILE (iam.access_policy), así que mostrarle el
  // formulario de subida bajo `canUpdate` lo dejaba enviar un POST que el
  // backend siempre iba a rechazar con 403.
  const canCreateEvidence = can('CREATE', 'CASE_FILE')
  const queryClient = useQueryClient()
  const { data: caseFile, isLoading, isError, error } = useCaseFile(trackingNumber)
  const [activeTab, setActiveTab] = useState<Tab>('resumen')

  const [targetStatus, setTargetStatus] = useState('')
  const [reason, setReason] = useState('')
  const [changingStatus, setChangingStatus] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [statusConflict, setStatusConflict] = useState(false)

  const [responsibleUserId, setResponsibleUserId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [assignConflict, setAssignConflict] = useState(false)

  const timeline = useTimeline(trackingNumber, activeTab === 'timeline')
  const evidenceList = useEvidenceList(trackingNumber, activeTab === 'evidencia')
  const persons = usePersons(trackingNumber, activeTab === 'personas')
  const actions = useActions(trackingNumber, activeTab === 'actuaciones')

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['case-files', 'detail', trackingNumber] })
    await queryClient.invalidateQueries({ queryKey: ['case-files', 'search'] })
  }

  /** S2.ADI.02: cada PATCH exige `If-Match` con la versión que este actor tiene en pantalla, no una recién leída del servidor. */
  function ifMatchHeader() {
    return { 'If-Match': `"${caseFile?.version ?? 0}"` }
  }

  async function handleChangeStatus() {
    if (!targetStatus || !reason.trim()) return
    setChangingStatus(true)
    setStatusError(null)
    setStatusConflict(false)
    try {
      await customFetch(`/api/v1/case-files/${trackingNumber}/status`, {
        method: 'PATCH',
        headers: ifMatchHeader(),
        body: JSON.stringify({ targetStatus, reason }),
      })
      setTargetStatus('')
      setReason('')
      await invalidate()
    } catch (err) {
      // S2.FE.07: otro usuario cambió el caso mientras este formulario estaba
      // abierto -- el mensaje del backend ya dice "recargue e intente de
      // nuevo" (messages_es.properties), el botón sólo hace exactamente eso.
      setStatusConflict(err instanceof ApiError && err.problem.code === 'OPTIMISTIC_LOCK_CONFLICT')
      setStatusError(err instanceof Error ? err.message : 'No se pudo cambiar el estado.')
    } finally {
      setChangingStatus(false)
    }
  }

  async function handleAssign() {
    if (!responsibleUserId.trim()) return
    setAssigning(true)
    setAssignError(null)
    setAssignConflict(false)
    try {
      await customFetch(`/api/v1/case-files/${trackingNumber}/assignment`, {
        method: 'PATCH',
        headers: ifMatchHeader(),
        body: JSON.stringify({ responsibleUserId }),
      })
      setResponsibleUserId('')
      await invalidate()
    } catch (err) {
      setAssignConflict(err instanceof ApiError && err.problem.code === 'OPTIMISTIC_LOCK_CONFLICT')
      setAssignError(err instanceof Error ? err.message : 'No se pudo asignar el responsable.')
    } finally {
      setAssigning(false)
    }
  }

  async function handleReloadAfterConflict() {
    setStatusError(null)
    setStatusConflict(false)
    setAssignError(null)
    setAssignConflict(false)
    setTargetStatus('')
    setReason('')
    setResponsibleUserId('')
    await invalidate()
  }

  if (isLoading) return <p className="text-sm text-text-secondary">Cargando…</p>
  if (isError || !caseFile) {
    return (
      <p className="text-sm text-critical">
        {error instanceof Error ? error.message : 'No se pudo cargar el caso.'}
      </p>
    )
  }

  const availableTransitions = caseFile.status ? (NEXT_STATUSES[caseFile.status] ?? []) : []

  return (
    <div>
      {caseFile.classificationLevel && <ClassificationBanner classificationLevel={caseFile.classificationLevel} />}

      <div className="mt-4 flex flex-wrap items-center gap-4 border-b border-border pb-4">
        {caseFile.trackingNumber && <TrackingNumberBadge value={caseFile.trackingNumber} />}
        {caseFile.status && <CaseStatusChip status={caseFile.status} />}
        {caseFile.priority && <PriorityIndicator priority={caseFile.priority} />}
        <span className="text-sm text-text-secondary">
          Responsable: {caseFile.responsibleUserId ?? 'sin asignar'}
        </span>
        {can('EXPORT', 'CASE_FILE') && (
          <div className="ml-auto">
            <ExportPdfButton trackingNumber={trackingNumber} />
          </div>
        )}
      </div>

      <nav className="mt-4 flex gap-1 border-b border-border" aria-label="Secciones del caso">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={
              'border-b-2 px-3 py-2 text-sm transition-colors duration-instant ' +
              (activeTab === tab.id
                ? 'border-accent text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary')
            }
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'resumen' && (
        <div>
          <p className="mt-4 max-w-2xl text-sm text-text-primary">{caseFile.summary}</p>

          <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-text-muted">Tipología</dt>
              <dd className="text-text-primary">{caseFile.crimeTypeCode ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Municipio</dt>
              <dd className="text-text-primary">{caseFile.municipalityCode ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Involucra menor</dt>
              <dd className="text-text-primary">{caseFile.involvesMinor ? 'Sí' : 'No'}</dd>
            </div>
          </dl>

          {canUpdate && (
            <div className="mt-8 grid gap-8 sm:grid-cols-2">
              <section>
                <h2 className="text-sm font-semibold text-text-primary">Cambiar estado</h2>
                {availableTransitions.length === 0 ? (
                  <p className="mt-2 text-sm text-text-secondary">Este caso no admite más transiciones.</p>
                ) : (
                  <div className="mt-2 flex flex-col gap-2">
                    <select
                      value={targetStatus}
                      onChange={(event) => setTargetStatus(event.target.value)}
                      className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
                    >
                      <option value="">Seleccione un estado</option>
                      {availableTransitions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <Input placeholder="Motivo" value={reason} onChange={(event) => setReason(event.target.value)} />
                    {statusError && <p className="text-sm text-critical">{statusError}</p>}
                    {statusConflict ? (
                      <Button variant="secondary" size="sm" onClick={handleReloadAfterConflict}>
                        Recargar caso
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!targetStatus || !reason.trim()}
                        loading={changingStatus}
                        onClick={handleChangeStatus}
                      >
                        Aplicar cambio
                      </Button>
                    )}
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-sm font-semibold text-text-primary">Asignar responsable</h2>
                <div className="mt-2 flex flex-col gap-2">
                  <Input
                    placeholder="UUID del responsable"
                    value={responsibleUserId}
                    onChange={(event) => setResponsibleUserId(event.target.value)}
                  />
                  {assignError && <p className="text-sm text-critical">{assignError}</p>}
                  {assignConflict ? (
                    <Button variant="secondary" size="sm" onClick={handleReloadAfterConflict}>
                      Recargar caso
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!responsibleUserId.trim()}
                      loading={assigning}
                      onClick={handleAssign}
                    >
                      Asignar
                    </Button>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="mt-4">
          {timeline.isLoading && <p className="text-sm text-text-secondary">Cargando…</p>}
          {timeline.isError && <p className="text-sm text-critical">No se pudo cargar la línea de tiempo.</p>}
          {timeline.data && <CaseTimeline entries={timeline.data} />}
        </div>
      )}

      {activeTab === 'evidencia' && (
        <EvidenceTab
          trackingNumber={trackingNumber}
          evidenceList={evidenceList.data}
          isLoading={evidenceList.isLoading}
          isError={evidenceList.isError}
          canUpload={canCreateEvidence}
          onUploaded={async () => {
            await queryClient.invalidateQueries({ queryKey: ['case-files', 'evidence', trackingNumber] })
            await queryClient.invalidateQueries({ queryKey: ['case-files', 'timeline', trackingNumber] })
          }}
        />
      )}

      {activeTab === 'personas' && (
        <PersonsTab
          trackingNumber={trackingNumber}
          persons={persons.data}
          isLoading={persons.isLoading}
          isError={persons.isError}
          canUpdate={canUpdate}
          onRegistered={async () => {
            await queryClient.invalidateQueries({ queryKey: ['case-files', 'persons', trackingNumber] })
            await queryClient.invalidateQueries({ queryKey: ['case-files', 'timeline', trackingNumber] })
          }}
        />
      )}

      {activeTab === 'actuaciones' && (
        <ActionsTab
          trackingNumber={trackingNumber}
          actions={actions.data}
          isLoading={actions.isLoading}
          isError={actions.isError}
          canUpdate={canUpdate}
          onRecorded={async () => {
            await queryClient.invalidateQueries({ queryKey: ['case-files', 'actions', trackingNumber] })
            await queryClient.invalidateQueries({ queryKey: ['case-files', 'timeline', trackingNumber] })
          }}
        />
      )}
    </div>
  )
}

/** S3.FE.05: síncrono en el backend (no hay cola de trabajos para esto) -- el spinner ES el estado de progreso. */
function ExportPdfButton({ trackingNumber }: { trackingNumber: string }) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    setError(null)
    try {
      const blob = await customFetch<Blob>(`/api/v1/case-files/${trackingNumber}/export.pdf`)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${trackingNumber}.pdf`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      if (err instanceof ApiError && err.problem.code === 'MINOR_PROTECTED_EXPORT_DENIED') {
        setError('Este caso involucra un menor de edad -- la exportación está bloqueada (docs/03 §6).')
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo exportar el PDF.')
      }
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" size="sm" loading={exporting} onClick={handleExport}>
        Exportar PDF
      </Button>
      {error && <p className="max-w-64 text-right text-2xs text-critical">{error}</p>}
    </div>
  )
}

function EvidenceTab({
  trackingNumber,
  evidenceList,
  isLoading,
  isError,
  canUpload,
  onUploaded,
}: {
  trackingNumber: string
  evidenceList: EvidenceResponse[] | undefined
  isLoading: boolean
  isError: boolean
  canUpload: boolean
  onUploaded: () => Promise<void>
}) {
  const [file, setFile] = useState<File | null>(null)
  const [evidenceType, setEvidenceType] = useState<string>('')
  const [description, setDescription] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [uploadHandle, setUploadHandle] = useState<UploadHandle<EvidenceResponse> | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function handleUpload(event: React.FormEvent) {
    event.preventDefault()
    if (!file || !evidenceType) return
    setUploadError(null)
    setProgress(0)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('evidenceType', evidenceType)
    if (description) formData.append('description', description)

    const handle = uploadFileWithProgress<EvidenceResponse>(
      `/api/v1/case-files/${trackingNumber}/evidence`,
      formData,
      setProgress,
    )
    setUploadHandle(handle)
    try {
      await handle.promise
      setFile(null)
      setEvidenceType('')
      setDescription('')
      await onUploaded()
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setUploadError(err instanceof Error ? err.message : 'No se pudo subir la evidencia.')
      }
    } finally {
      setProgress(null)
      setUploadHandle(null)
    }
  }

  return (
    <div className="mt-4">
      {canUpload && (
        <form onSubmit={handleUpload} className="mb-6 flex flex-wrap items-end gap-3 border-b border-border pb-4">
          <input
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="text-sm text-text-primary"
          />
          <select
            value={evidenceType}
            onChange={(event) => setEvidenceType(event.target.value)}
            className="h-[var(--control-height-sm)] rounded-sm border border-border-strong bg-surface px-2 text-xs text-text-primary"
          >
            <option value="">Tipo</option>
            {EVIDENCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <Input
            size="sm"
            placeholder="Descripción (opcional)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-56"
          />
          {progress === null ? (
            <Button type="submit" variant="primary" size="sm" disabled={!file || !evidenceType}>
              Subir
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-sunken">
                <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-2xs text-text-secondary">{progress}%</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => uploadHandle?.cancel()}>
                Cancelar
              </Button>
            </div>
          )}
          {uploadError && <p className="w-full text-sm text-critical">{uploadError}</p>}
        </form>
      )}

      {isLoading && <p className="text-sm text-text-secondary">Cargando…</p>}
      {isError && <p className="text-sm text-critical">No se pudo cargar la evidencia.</p>}
      {evidenceList && evidenceList.length === 0 && (
        <p className="text-sm text-text-secondary">Sin evidencia adjunta todavía.</p>
      )}
      {evidenceList && evidenceList.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {evidenceList.map((evidence) => (
            <EvidenceCard key={evidence.id} evidence={evidence} />
          ))}
        </div>
      )}
    </div>
  )
}

function PersonsTab({
  trackingNumber,
  persons,
  isLoading,
  isError,
  canUpdate,
  onRegistered,
}: {
  trackingNumber: string
  persons: PersonOfInterestResponse[] | undefined
  isLoading: boolean
  isError: boolean
  canUpdate: boolean
  onRegistered: () => Promise<void>
}) {
  const [partyRole, setPartyRole] = useState('')
  const [fullName, setFullName] = useState('')
  const [documentType, setDocumentType] = useState('')
  const [documentNumber, setDocumentNumber] = useState('')
  const [alias, setAlias] = useState('')
  const [minor, setMinor] = useState(false)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!partyRole || !fullName.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await customFetch(`/api/v1/case-files/${trackingNumber}/persons`, {
        method: 'POST',
        body: JSON.stringify({
          partyRole,
          fullName,
          documentType: documentType || undefined,
          documentNumber: documentNumber || undefined,
          alias: alias || undefined,
          minor,
          notes: notes || undefined,
        }),
      })
      setPartyRole('')
      setFullName('')
      setDocumentType('')
      setDocumentNumber('')
      setAlias('')
      setMinor(false)
      setNotes('')
      await onRegistered()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la persona.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-4">
      {canUpdate && (
        <form onSubmit={handleSubmit} className="mb-6 flex max-w-2xl flex-col gap-3 border-b border-border pb-4">
          <div className="flex flex-wrap gap-3">
            <select
              value={partyRole}
              onChange={(event) => setPartyRole(event.target.value)}
              className="h-[var(--control-height-sm)] rounded-sm border border-border-strong bg-surface px-2 text-xs text-text-primary"
            >
              <option value="">Rol</option>
              {PARTY_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <Input size="sm" placeholder="Nombre completo *" value={fullName} onChange={(event) => setFullName(event.target.value)} className="flex-1" />
            <Input size="sm" placeholder="Alias" value={alias} onChange={(event) => setAlias(event.target.value)} className="w-32" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Input size="sm" placeholder="Tipo de documento" value={documentType} onChange={(event) => setDocumentType(event.target.value)} className="w-40" />
            <Input size="sm" placeholder="Número de documento" value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} className="w-40" />
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input type="checkbox" checked={minor} onChange={(event) => setMinor(event.target.checked)} className="h-4 w-4 rounded-xs border-border-strong" />
              Menor de edad
            </label>
          </div>
          <Input size="sm" placeholder="Notas (opcional)" value={notes} onChange={(event) => setNotes(event.target.value)} />
          {error && <p className="text-sm text-critical">{error}</p>}
          <div>
            <Button type="submit" variant="primary" size="sm" loading={submitting} disabled={!partyRole || !fullName.trim()}>
              Registrar persona
            </Button>
          </div>
        </form>
      )}

      {isLoading && <p className="text-sm text-text-secondary">Cargando…</p>}
      {isError && <p className="text-sm text-critical">No se pudo cargar las personas.</p>}
      {persons && persons.length === 0 && <p className="text-sm text-text-secondary">Sin personas registradas todavía.</p>}
      {persons && persons.length > 0 && (
        <ul className="flex flex-col gap-2">
          {persons.map((person) => (
            <li key={person.id} className="flex items-center gap-3 rounded-sm border border-border-strong p-2 text-sm">
              <span className="font-medium text-text-primary">{person.partyRole}</span>
              {person.alias && <span className="text-text-secondary">"{person.alias}"</span>}
              {person.minor && <span className="text-2xs font-medium text-critical">MENOR</span>}
              <span className="ml-auto text-2xs text-text-muted">{formatDateTime(person.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ActionsTab({
  trackingNumber,
  actions,
  isLoading,
  isError,
  canUpdate,
  onRecorded,
}: {
  trackingNumber: string
  actions: CaseActionResponse[] | undefined
  isLoading: boolean
  isError: boolean
  canUpdate: boolean
  onRecorded: () => Promise<void>
}) {
  const [actionType, setActionType] = useState('')
  const [description, setDescription] = useState('')
  const [performedAt, setPerformedAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!actionType || !description.trim() || !performedAt) return
    setSubmitting(true)
    setError(null)
    try {
      await customFetch(`/api/v1/case-files/${trackingNumber}/actions`, {
        method: 'POST',
        body: JSON.stringify({ actionType, description, performedAt: new Date(performedAt).toISOString() }),
      })
      setActionType('')
      setDescription('')
      setPerformedAt('')
      await onRecorded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la actuación.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-4">
      {canUpdate && (
        <form onSubmit={handleSubmit} className="mb-6 flex max-w-2xl flex-wrap items-end gap-3 border-b border-border pb-4">
          <select
            value={actionType}
            onChange={(event) => setActionType(event.target.value)}
            className="h-[var(--control-height-sm)] rounded-sm border border-border-strong bg-surface px-2 text-xs text-text-primary"
          >
            <option value="">Tipo</option>
            {ACTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <Input size="sm" placeholder="Descripción" value={description} onChange={(event) => setDescription(event.target.value)} className="flex-1" />
          <label className="flex flex-col gap-1 text-2xs text-text-secondary">
            Ocurrió el (no puede ser futuro)
            <input
              type="datetime-local"
              value={performedAt}
              max={new Date().toISOString().slice(0, 16)}
              onChange={(event) => setPerformedAt(event.target.value)}
              className="h-[var(--control-height-sm)] rounded-sm border border-border-strong bg-surface px-2 text-xs text-text-primary"
            />
          </label>
          {error && <p className="w-full text-sm text-critical">{error}</p>}
          <Button type="submit" variant="primary" size="sm" loading={submitting} disabled={!actionType || !description.trim() || !performedAt}>
            Registrar
          </Button>
        </form>
      )}

      {isLoading && <p className="text-sm text-text-secondary">Cargando…</p>}
      {isError && <p className="text-sm text-critical">No se pudo cargar las actuaciones.</p>}
      {actions && actions.length === 0 && <p className="text-sm text-text-secondary">Sin actuaciones registradas todavía.</p>}
      {actions && actions.length > 0 && (
        <ul className="flex flex-col gap-2">
          {actions.map((action) => (
            <li key={action.id} className="rounded-sm border border-border-strong p-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-text-primary">{action.actionType}</span>
                <span className="ml-auto text-2xs text-text-muted">{formatDateTime(action.performedAt)}</span>
              </div>
              <p className="mt-1 text-text-secondary">{action.description}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
