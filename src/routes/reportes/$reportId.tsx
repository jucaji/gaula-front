import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { customFetch } from '@/api/client'
import { ApiError, type ApiFieldError } from '@/api/problem'
import type { OperationalReportResponse, ReportTemplateResponse } from '@/api/generated/models'
import { clearReportDraft, loadReportDraft, saveReportDraft } from '@/lib/storage/reportDraftStore'
import { TemplateForm } from '@/design-system/patterns/TemplateForm'
import { setAtPath, type ReportPayload } from '@/lib/reporting/templatePath'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import { formatDateTime } from '@/lib/format/formatDateTime'

export const Route = createFileRoute('/reportes/$reportId')({
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'OPERATIONAL_REPORT')) {
      throw redirect({ to: '/', search: { denied: 'OPERATIONAL_REPORT' } })
    }
  },
  component: ReportDetailPage,
})

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  UNDER_REVIEW: 'En revisión',
  VALIDATED: 'Validado',
  REJECTED: 'Rechazado',
}

function useReport(reportId: string) {
  return useQuery({
    queryKey: ['reporting', 'reports', reportId],
    queryFn: () => customFetch<OperationalReportResponse>(`/api/v1/operational-reports/${reportId}`),
    networkMode: 'always',
    retry: false,
  })
}

function useReportTemplate(templateId: string | undefined) {
  return useQuery({
    queryKey: ['reporting', 'templates', templateId],
    queryFn: () => customFetch<ReportTemplateResponse>(`/api/v1/report-templates/${templateId}`),
    enabled: Boolean(templateId),
    staleTime: 60_000,
    networkMode: 'always',
    retry: false,
  })
}

function ReportDetailPage() {
  const { reportId } = Route.useParams()
  const { can } = Route.useRouteContext()
  const queryClient = useQueryClient()
  const report = useReport(reportId)
  const template = useReportTemplate(report.data?.templateId)

  const [payload, setPayload] = useState<ReportPayload>({})
  const [errors, setErrors] = useState<ApiFieldError[]>([])
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const loadedFromServerRef = useRef<string | null>(null)

  // Trae el payload del servidor la primera vez que llega -- si ya había un
  // borrador local más reciente sin guardar, ese gana (S6.FE.03: recuperación
  // tras cierre accidental).
  useEffect(() => {
    if (!report.data?.payload || loadedFromServerRef.current === reportId) return
    loadedFromServerRef.current = reportId
    loadReportDraft(reportId).then((localDraft) => {
      setPayload(localDraft ?? (report.data?.payload as ReportPayload))
    })
  }, [report.data, reportId])

  // S6.FE.03: autoguardado local con debounce de 3 s mientras sigue en borrador.
  useEffect(() => {
    if (report.data?.status !== 'DRAFT') return
    const timer = setTimeout(() => {
      void saveReportDraft(reportId, payload)
    }, 3000)
    return () => clearTimeout(timer)
  }, [payload, reportId, report.data?.status])

  async function handleSaveDraft() {
    setSaving(true)
    setActionError(null)
    setErrors([])
    try {
      await customFetch<OperationalReportResponse>(`/api/v1/operational-reports/${reportId}`, {
        method: 'PUT',
        body: JSON.stringify({ payload }),
      })
      await clearReportDraft(reportId)
      await queryClient.invalidateQueries({ queryKey: ['reporting', 'reports', reportId] })
    } catch (err) {
      if (err instanceof ApiError && err.problem.errors) {
        setErrors(err.problem.errors)
        setActionError('El formulario tiene campos por corregir.')
      } else {
        setActionError(err instanceof Error ? err.message : 'No se pudo guardar el borrador.')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    setSaving(true)
    setActionError(null)
    try {
      await customFetch(`/api/v1/operational-reports/${reportId}/submit`, { method: 'POST' })
      await queryClient.invalidateQueries({ queryKey: ['reporting', 'reports', reportId] })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo enviar el reporte.')
    } finally {
      setSaving(false)
    }
  }

  async function handleValidate() {
    setSaving(true)
    setActionError(null)
    try {
      await customFetch(`/api/v1/operational-reports/${reportId}/validate`, { method: 'POST' })
      await queryClient.invalidateQueries({ queryKey: ['reporting', 'reports', reportId] })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo validar el reporte.')
    } finally {
      setSaving(false)
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) return
    setSaving(true)
    setActionError(null)
    try {
      await customFetch(`/api/v1/operational-reports/${reportId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason }),
      })
      setShowRejectForm(false)
      await queryClient.invalidateQueries({ queryKey: ['reporting', 'reports', reportId] })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo rechazar el reporte.')
    } finally {
      setSaving(false)
    }
  }

  async function handleExportPdf() {
    try {
      const blob = await customFetch<Blob>(`/api/v1/operational-reports/${reportId}/export.pdf`)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `reporte-${reportId}.pdf`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo exportar el PDF.')
    }
  }

  if (report.isLoading || template.isLoading) {
    return <p className="p-6 text-sm text-text-secondary">Cargando…</p>
  }
  if (report.isError || !report.data) {
    return <p className="p-6 text-sm text-critical">No se pudo cargar el reporte.</p>
  }

  const status = report.data.status ?? 'DRAFT'
  const isDraft = status === 'DRAFT'
  const isUnderReview = status === 'UNDER_REVIEW'

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Reporte operacional</h1>
        <span className="rounded-full bg-surface-sunken px-2 py-1 text-2xs font-medium text-text-secondary">{STATUS_LABEL[status] ?? status}</span>
      </div>
      {report.data.submittedAt && (
        // `submittedAt`/`submittedBy` se fijan al CAPTURAR el borrador (OperationalReport.createDraft),
        // no al enviarlo a revisión -- el backend no distingue esos dos momentos todavía.
        <p className="mt-1 text-2xs text-text-muted">Capturado {formatDateTime(report.data.submittedAt)}</p>
      )}
      {status === 'REJECTED' && report.data.rejectionReason && (
        <p className="mt-2 rounded-sm border border-critical bg-surface-sunken p-2 text-sm text-critical">Motivo de rechazo: {report.data.rejectionReason}</p>
      )}

      {template.data?.sections && (
        <div className="mt-4">
          <TemplateForm
            sections={template.data.sections}
            values={payload}
            errors={errors}
            readOnly={!isDraft}
            onFieldChange={(path, value) => setPayload((prev) => setAtPath(prev, path, value))}
          />
        </div>
      )}

      {actionError && <p className="mt-4 text-sm text-critical">{actionError}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isDraft && (
          <>
            <Button variant="secondary" size="md" loading={saving} onClick={handleSaveDraft}>
              Guardar borrador
            </Button>
            <Button variant="primary" size="md" loading={saving} onClick={handleSubmit}>
              Enviar
            </Button>
          </>
        )}

        {isUnderReview && can('READ', 'OPERATIONAL_REPORT_REVIEW') && (
          <>
            <Button variant="primary" size="md" loading={saving} onClick={handleValidate}>
              Validar
            </Button>
            <Button variant="danger" size="md" onClick={() => setShowRejectForm((value) => !value)}>
              Rechazar
            </Button>
          </>
        )}

        {(status === 'VALIDATED' || status === 'REJECTED') && (
          <Button variant="secondary" size="md" onClick={handleExportPdf}>
            Exportar PDF
          </Button>
        )}
      </div>

      {showRejectForm && (
        <div className="mt-3 flex flex-col gap-2 rounded-sm border border-border-strong bg-surface-raised p-3">
          <label className="flex flex-col gap-1 text-sm text-text-primary">
            Motivo del rechazo *
            <Input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
          </label>
          <div>
            <Button variant="danger" size="sm" loading={saving} disabled={!rejectReason.trim()} onClick={handleReject}>
              Confirmar rechazo
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
