import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { customFetch } from '@/api/client'
import { ApiError } from '@/api/problem'
import type { CaseFileResponse } from '@/api/generated/models'
import { CaseStatusChip } from '@/design-system/domain/CaseStatusChip'
import { OfflineBanner } from '@/design-system/patterns/OfflineBanner'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import { enqueueMutation } from '@/lib/offline/mutationQueue'
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus'

export const Route = createFileRoute('/campo/$trackingNumber')({
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'CASE_FILE')) {
      throw redirect({ to: '/', search: { denied: 'CASE_FILE' } })
    }
  },
  component: FieldCaseDetailPage,
})

const ACTION_TYPES = ['VERIFICATION', 'FIELD_OPERATION', 'INTERVIEW', 'EXTERNAL_REQUEST', 'LEGAL_NOTIFICATION', 'NOTE'] as const
const EVIDENCE_TYPES = ['PHOTO', 'VIDEO', 'AUDIO', 'DOCUMENT', 'SCREENSHOT', 'CDR'] as const
/** UX ONLY, mismo mapa que casos/$trackingNumber.tsx -- el backend rechaza igual una transición inválida. */
const NEXT_STATUSES: Record<string, string[]> = {
  RECEIVED: ['UNDER_VERIFICATION', 'CLOSED_WITHOUT_MERIT'],
  UNDER_VERIFICATION: ['IN_OPERATION', 'CLOSED_WITHOUT_MERIT'],
  IN_OPERATION: ['RESULT_RECORDED', 'CLOSED_WITHOUT_MERIT'],
  RESULT_RECORDED: ['PROSECUTED', 'CLOSED', 'CLOSED_WITHOUT_MERIT'],
  PROSECUTED: ['CLOSED', 'CLOSED_WITHOUT_MERIT'],
  CLOSED: [],
  CLOSED_WITHOUT_MERIT: [],
}

type Sheet = 'none' | 'action' | 'evidence' | 'status'

function useFieldCase(trackingNumber: string) {
  return useQuery({
    queryKey: ['case-files', 'detail', trackingNumber],
    queryFn: () => customFetch<CaseFileResponse>(`/api/v1/case-files/${trackingNumber}`),
    staleTime: 60_000,
    networkMode: 'always',
    retry: false,
  })
}

/**
 * S8.FE.02/03/06 (docs/06 §8.3, SPEC-0209): una columna, objetivos ≥44px,
 * tres acciones fijas en el borde inferior. "Registrar actuación" y
 * "Adjuntar evidencia" son adiciones puras -- se encolan sin red
 * (`enqueueMutation`). "Cambiar estado" exige `If-Match` con la versión
 * actual del caso (control de concurrencia optimista, S2.ADI.02): encolarlo
 * a ciegas replicaría un conflicto de versión más tarde en vez de evitarlo,
 * así que exige conexión -- mismo criterio que S8.FE.06 pide para "crear
 * caso, buscar".
 */
function FieldCaseDetailPage() {
  const { trackingNumber } = Route.useParams()
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const caseFile = useFieldCase(trackingNumber)

  const [sheet, setSheet] = useState<Sheet>('none')
  const [actionType, setActionType] = useState('')
  const [description, setDescription] = useState('')
  const [evidenceType, setEvidenceType] = useState('')
  const [targetStatus, setTargetStatus] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['case-files', 'detail', trackingNumber] })
  }

  async function handleRecordAction() {
    if (!actionType || !description.trim()) return
    setBusy(true)
    setError(null)
    try {
      const { sentImmediately } = await enqueueMutation({
        url: `/api/v1/case-files/${trackingNumber}/actions`,
        method: 'POST',
        kind: 'json',
        body: { actionType, description, performedAt: new Date().toISOString() },
        label: `Actuación: ${actionType}`,
      })
      setFeedback(sentImmediately ? 'Actuación registrada.' : 'Sin conexión -- la actuación quedó en la cola, se enviará sola.')
      setActionType('')
      setDescription('')
      setSheet('none')
      await invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la actuación.')
    } finally {
      setBusy(false)
    }
  }

  async function handleAttachEvidence() {
    const file = fileInputRef.current?.files?.[0]
    if (!file || !evidenceType) return
    setBusy(true)
    setError(null)
    try {
      const { sentImmediately } = await enqueueMutation({
        url: `/api/v1/case-files/${trackingNumber}/evidence`,
        method: 'POST',
        kind: 'multipart',
        fields: [
          { key: 'file', value: file, filename: file.name },
          { key: 'evidenceType', value: evidenceType },
        ],
        label: `Evidencia: ${file.name}`,
      })
      setFeedback(sentImmediately ? 'Evidencia adjuntada.' : 'Sin conexión -- la evidencia quedó en la cola, se enviará sola.')
      setEvidenceType('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      setSheet('none')
      await invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo adjuntar la evidencia.')
    } finally {
      setBusy(false)
    }
  }

  async function handleChangeStatus() {
    if (!targetStatus || !reason.trim() || !caseFile.data) return
    setBusy(true)
    setError(null)
    try {
      await customFetch(`/api/v1/case-files/${trackingNumber}/status`, {
        method: 'PATCH',
        headers: { 'If-Match': `"${caseFile.data.version ?? 0}"` },
        body: JSON.stringify({ targetStatus, reason }),
      })
      setFeedback('Estado actualizado.')
      setTargetStatus('')
      setReason('')
      setSheet('none')
      await invalidate()
    } catch (err) {
      if (err instanceof ApiError && err.problem.code === 'OPTIMISTIC_LOCK_CONFLICT') {
        setError('Otro usuario modificó el caso mientras tanto -- recargue e intente de nuevo.')
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (caseFile.isLoading) return <p className="p-6 text-sm text-text-secondary">Cargando…</p>
  if (caseFile.isError && !caseFile.data) {
    return (
      <div className="p-6">
        <p className="text-sm text-critical">No se pudo cargar este caso -- sin conexión y sin una copia local todavía.</p>
      </div>
    )
  }
  const data = caseFile.data
  if (!data) return null

  const availableTransitions = data.status ? (NEXT_STATUSES[data.status] ?? []) : []

  return (
    <div className="flex h-full flex-col">
      <OfflineBanner />

      <div className="flex-1 overflow-y-auto p-3 pb-24">
        <h1 className="font-mono text-lg font-semibold text-text-primary">{data.trackingNumber}</h1>
        {data.status && <CaseStatusChip status={data.status} />}
        <p className="mt-2 text-sm text-text-primary">{data.summary}</p>
        <dl className="mt-3 flex flex-col gap-1 text-sm text-text-secondary">
          <div>
            <dt className="inline font-medium text-text-primary">Municipio: </dt>
            <dd className="inline">{data.municipalityCode ?? '—'}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-text-primary">Tipología: </dt>
            <dd className="inline">{data.crimeTypeCode ?? '—'}</dd>
          </div>
        </dl>

        {feedback && <p className="mt-3 text-sm text-stable">{feedback}</p>}
        {error && <p className="mt-3 text-sm text-critical">{error}</p>}

        {sheet === 'action' && (
          <div className="mt-4 flex flex-col gap-2 rounded-sm border border-border-strong bg-surface-raised p-3">
            <h2 className="text-sm font-semibold text-text-primary">Registrar actuación</h2>
            <label className="flex flex-col gap-1 text-sm text-text-primary">
              Tipo
              <select
                value={actionType}
                onChange={(event) => setActionType(event.target.value)}
                className="h-11 rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
              >
                <option value="">Seleccione…</option>
                {ACTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-text-primary">
              Descripción
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className="rounded-sm border border-border-strong bg-surface px-2.5 py-2 text-sm text-text-primary"
              />
            </label>
            <div className="flex gap-2">
              <Button variant="primary" size="md" loading={busy} disabled={!actionType || !description.trim()} onClick={handleRecordAction}>
                Guardar
              </Button>
              <Button variant="ghost" size="md" onClick={() => setSheet('none')}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {sheet === 'evidence' && (
          <div className="mt-4 flex flex-col gap-2 rounded-sm border border-border-strong bg-surface-raised p-3">
            <h2 className="text-sm font-semibold text-text-primary">Adjuntar evidencia</h2>
            <label className="flex flex-col gap-1 text-sm text-text-primary">
              Tipo
              <select
                value={evidenceType}
                onChange={(event) => setEvidenceType(event.target.value)}
                className="h-11 rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
              >
                <option value="">Seleccione…</option>
                {EVIDENCE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <input ref={fileInputRef} type="file" className="min-h-[var(--tap-min)] text-sm text-text-primary" />
            <div className="flex gap-2">
              <Button variant="primary" size="md" loading={busy} disabled={!evidenceType} onClick={handleAttachEvidence}>
                Guardar
              </Button>
              <Button variant="ghost" size="md" onClick={() => setSheet('none')}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {sheet === 'status' && (
          <div className="mt-4 flex flex-col gap-2 rounded-sm border border-border-strong bg-surface-raised p-3">
            <h2 className="text-sm font-semibold text-text-primary">Cambiar estado</h2>
            {!online && <p className="text-sm text-alert">Cambiar de estado exige conexión -- vuelva a intentarlo cuando recupere señal.</p>}
            {online && (
              <>
                <label className="flex flex-col gap-1 text-sm text-text-primary">
                  Nuevo estado
                  <select
                    value={targetStatus}
                    onChange={(event) => setTargetStatus(event.target.value)}
                    className="h-11 rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
                  >
                    <option value="">Seleccione…</option>
                    {availableTransitions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-text-primary">
                  Motivo
                  <Input value={reason} onChange={(event) => setReason(event.target.value)} />
                </label>
                <div className="flex gap-2">
                  <Button variant="primary" size="md" loading={busy} disabled={!targetStatus || !reason.trim()} onClick={handleChangeStatus}>
                    Confirmar
                  </Button>
                  <Button variant="ghost" size="md" onClick={() => setSheet('none')}>
                    Cancelar
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1 border-t border-border bg-surface p-2">
        <button
          type="button"
          onClick={() => setSheet(sheet === 'action' ? 'none' : 'action')}
          className="flex min-h-11 items-center justify-center rounded-sm bg-surface-sunken px-2 text-center text-xs font-medium text-text-primary"
        >
          Registrar actuación
        </button>
        <button
          type="button"
          onClick={() => setSheet(sheet === 'evidence' ? 'none' : 'evidence')}
          className="flex min-h-11 items-center justify-center rounded-sm bg-surface-sunken px-2 text-center text-xs font-medium text-text-primary"
        >
          Adjuntar evidencia
        </button>
        <button
          type="button"
          onClick={() => setSheet(sheet === 'status' ? 'none' : 'status')}
          className="flex min-h-11 items-center justify-center rounded-sm bg-surface-sunken px-2 text-center text-xs font-medium text-text-primary"
        >
          Cambiar estado
        </button>
      </div>
    </div>
  )
}
