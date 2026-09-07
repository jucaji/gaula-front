import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { customFetch } from '@/api/client'
import { ApiError, type ApiFieldError } from '@/api/problem'
import type { EmailIngestionResponse, OperationalReportResponse, ReportTemplateResponse } from '@/api/generated/models'
import { useSessionQuery } from '@/lib/auth/useSession'
import { TemplateForm } from '@/design-system/patterns/TemplateForm'
import { setAtPath, type ReportPayload } from '@/lib/reporting/templatePath'
import { Button } from '@/design-system/primitives/Button'
import { formatDateTime } from '@/lib/format/formatDateTime'

export const Route = createFileRoute('/reportes/revision/$emailIngestionId')({
  beforeLoad: ({ context }) => {
    if (!context.can('CREATE', 'OPERATIONAL_REPORT')) {
      throw redirect({ to: '/', search: { denied: 'OPERATIONAL_REPORT' } })
    }
  },
  component: ReviewQueueDetailPage,
})

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  PARSED: 'Auto-procesado',
  NEEDS_REVIEW: 'Necesita revisión',
  FAILED: 'Fallido',
  DISCARDED: 'Descartado',
}

function useEmailIngestion(emailIngestionId: string) {
  return useQuery({
    queryKey: ['reporting', 'review-queue', emailIngestionId],
    queryFn: () => customFetch<EmailIngestionResponse>(`/api/v1/review-queue/${emailIngestionId}`),
    networkMode: 'always',
    retry: false,
  })
}

function useCurrentTemplate() {
  return useQuery({
    queryKey: ['reporting', 'templates', 'current'],
    queryFn: () => customFetch<ReportTemplateResponse>('/api/v1/report-templates/current'),
    staleTime: 60_000,
    networkMode: 'always',
    retry: false,
  })
}

/**
 * S7.FE.01: comparación lado a lado. El backend NO extrae un payload
 * estructurado del correo (`EmailIngestionResponse` sólo trae texto plano
 * de referencia, nunca una estructura adivinada -- docs/12 nota de Sprint
 * 7) -- el operador lee `extractedText` a la izquierda y captura el
 * reporte completo a la derecha, igual que un reporte nuevo manual.
 */
function ReviewQueueDetailPage() {
  const { emailIngestionId } = Route.useParams()
  const navigate = useNavigate()
  const session = useSessionQuery()
  const emailIngestion = useEmailIngestion(emailIngestionId)
  const template = useCurrentTemplate()

  const [payload, setPayload] = useState<ReportPayload>({})
  const [errors, setErrors] = useState<ApiFieldError[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleResolve() {
    if (!session.data?.operationalUnitId) {
      setSaveError('Su usuario no tiene una unidad operacional asignada -- contacte al administrador.')
      return
    }
    setSaving(true)
    setSaveError(null)
    setErrors([])
    try {
      const created = await customFetch<OperationalReportResponse>(`/api/v1/review-queue/${emailIngestionId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          territorialUnitId: session.data.territorialUnitId,
          operationalUnitId: session.data.operationalUnitId,
          payload,
        }),
      })
      if (created.id) {
        await navigate({ to: '/reportes/$reportId', params: { reportId: created.id } })
      }
    } catch (err) {
      if (err instanceof ApiError && err.problem.errors) {
        setErrors(err.problem.errors)
        setSaveError('El formulario tiene campos por corregir.')
      } else {
        setSaveError(err instanceof Error ? err.message : 'No se pudo resolver el correo.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (emailIngestion.isLoading || template.isLoading) {
    return <p className="p-6 text-sm text-text-secondary">Cargando…</p>
  }
  if (emailIngestion.isError || !emailIngestion.data) {
    return <p className="p-6 text-sm text-critical">No se pudo cargar el correo.</p>
  }

  const item = emailIngestion.data
  const canResolve = item.status === 'NEEDS_REVIEW'

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Revisar correo</h1>
        <span className="rounded-full bg-surface-sunken px-2 py-1 text-2xs font-medium text-text-secondary">{STATUS_LABEL[item.status ?? ''] ?? item.status}</span>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-4 overflow-hidden">
        <section className="flex flex-col gap-2 overflow-y-auto pr-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Correo original</h2>
          <dl className="text-sm text-text-secondary">
            <div>
              <dt className="inline font-medium text-text-primary">De: </dt>
              <dd className="inline">{item.sender ?? '—'}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-text-primary">Asunto: </dt>
              <dd className="inline">{item.subject ?? '—'}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-text-primary">Recibido: </dt>
              <dd className="inline">{formatDateTime(item.receivedAt)}</dd>
            </div>
          </dl>
          {item.parseError && <p className="rounded-sm border border-critical bg-surface-sunken p-2 text-sm text-critical">{item.parseError}</p>}
          <pre className="flex-1 whitespace-pre-wrap rounded-sm border border-border-strong bg-surface-sunken p-3 text-sm text-text-primary">
            {item.extractedText || 'Sin texto extraído.'}
          </pre>
        </section>

        <section className="flex flex-col gap-2 overflow-y-auto pl-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Reporte a capturar</h2>
          {!canResolve && (
            <p className="text-sm text-text-secondary">
              Este correo no está en estado "Necesita revisión" -- no se puede resolver desde aquí.
            </p>
          )}
          {canResolve && template.data?.sections && (
            <>
              <TemplateForm
                sections={template.data.sections}
                values={payload}
                errors={errors}
                onFieldChange={(path, value) => setPayload((prev) => setAtPath(prev, path, value))}
              />
              {saveError && <p className="text-sm text-critical">{saveError}</p>}
              <div>
                <Button variant="primary" size="md" loading={saving} onClick={handleResolve}>
                  Crear reporte
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
