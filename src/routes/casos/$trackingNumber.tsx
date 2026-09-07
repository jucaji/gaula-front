import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { customFetch } from '@/api/client'
import { ApiError } from '@/api/problem'
import type { CaseFileResponse } from '@/api/generated/models'
import { TrackingNumberBadge } from '@/design-system/domain/TrackingNumberBadge'
import { CaseStatusChip } from '@/design-system/domain/CaseStatusChip'
import { PriorityIndicator } from '@/design-system/domain/PriorityIndicator'
import { ClassificationBanner } from '@/design-system/domain/ClassificationBanner'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'

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

function useCaseFile(trackingNumber: string) {
  return useQuery({
    queryKey: ['case-files', 'detail', trackingNumber],
    queryFn: () => customFetch<CaseFileResponse>(`/api/v1/case-files/${trackingNumber}`),
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

function CaseDetailPage() {
  const { trackingNumber } = Route.useParams()
  const { can } = Route.useRouteContext()
  const canUpdate = can('UPDATE', 'CASE_FILE')
  const queryClient = useQueryClient()
  const { data: caseFile, isLoading, isError, error } = useCaseFile(trackingNumber)

  const [targetStatus, setTargetStatus] = useState('')
  const [reason, setReason] = useState('')
  const [changingStatus, setChangingStatus] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [statusConflict, setStatusConflict] = useState(false)

  const [responsibleUserId, setResponsibleUserId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [assignConflict, setAssignConflict] = useState(false)

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
      </div>

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
  )
}
