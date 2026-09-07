import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { customFetch } from '@/api/client'
import { ApiError } from '@/api/problem'
import type { OperationalReportResponse, ReportTemplateResponse } from '@/api/generated/models'
import { useSessionQuery } from '@/lib/auth/useSession'
import { clearReportDraft, loadReportDraft, saveReportDraft } from '@/lib/storage/reportDraftStore'
import { TemplateForm } from '@/design-system/patterns/TemplateForm'
import { setAtPath, type ReportPayload } from '@/lib/reporting/templatePath'
import { Button } from '@/design-system/primitives/Button'
import type { ApiFieldError } from '@/api/problem'

export const Route = createFileRoute('/reportes/nuevo')({
  beforeLoad: ({ context }) => {
    if (!context.can('CREATE', 'OPERATIONAL_REPORT')) {
      throw redirect({ to: '/', search: { denied: 'OPERATIONAL_REPORT' } })
    }
  },
  component: NewReportPage,
})

const DRAFT_KEY = 'new'

function useCurrentTemplate() {
  return useQuery({
    queryKey: ['reporting', 'templates', 'current'],
    queryFn: () => customFetch<ReportTemplateResponse>('/api/v1/report-templates/current'),
    staleTime: 60_000,
    networkMode: 'always',
    retry: false,
  })
}

/** S6.FE.01/02/03: la plantilla dibuja el formulario; SaveReportDraftService valida el payload COMPLETO en cada guardado. */
function NewReportPage() {
  const navigate = useNavigate()
  const session = useSessionQuery()
  const template = useCurrentTemplate()

  const [payload, setPayload] = useState<ReportPayload>({})
  const [errors, setErrors] = useState<ApiFieldError[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const loadedDraftRef = useRef(false)

  // S6.FE.03: recupera el borrador local si el operador cerró la pestaña por accidente.
  useEffect(() => {
    if (loadedDraftRef.current) return
    loadedDraftRef.current = true
    loadReportDraft(DRAFT_KEY).then((draft) => {
      if (draft) setPayload(draft)
    })
  }, [])

  // S6.FE.03: autoguardado local con debounce de 3 s -- todavía no existe un reporte real en el servidor.
  useEffect(() => {
    const timer = setTimeout(() => {
      void saveReportDraft(DRAFT_KEY, payload)
    }, 3000)
    return () => clearTimeout(timer)
  }, [payload])

  async function handleSave() {
    if (!session.data?.operationalUnitId) {
      setSaveError('Su usuario no tiene una unidad operacional asignada -- contacte al administrador.')
      return
    }
    setSaving(true)
    setSaveError(null)
    setErrors([])
    try {
      const created = await customFetch<OperationalReportResponse>('/api/v1/operational-reports', {
        method: 'POST',
        body: JSON.stringify({
          territorialUnitId: session.data.territorialUnitId,
          operationalUnitId: session.data.operationalUnitId,
          payload,
        }),
      })
      await clearReportDraft(DRAFT_KEY)
      if (created.id) {
        await navigate({ to: '/reportes/$reportId', params: { reportId: created.id } })
      }
    } catch (err) {
      if (err instanceof ApiError && err.problem.errors) {
        setErrors(err.problem.errors)
        setSaveError('El formulario tiene campos por corregir.')
      } else {
        setSaveError(err instanceof Error ? err.message : 'No se pudo guardar el borrador.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (template.isLoading || session.isLoading) {
    return <p className="p-6 text-sm text-text-secondary">Cargando…</p>
  }
  if (template.isError || !template.data?.sections) {
    return <p className="p-6 text-sm text-critical">No se pudo cargar la plantilla de reporte.</p>
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold text-text-primary">Nuevo reporte operacional</h1>
      {template.data.provisional && (
        <p className="mt-1 text-2xs text-alert">
          Plantilla provisional (v{template.data.version}) -- el insumo institucional definitivo todavía no ha llegado (docs/03 §3.4).
        </p>
      )}

      <div className="mt-4">
        <TemplateForm
          sections={template.data.sections}
          values={payload}
          errors={errors}
          onFieldChange={(path, value) => setPayload((prev) => setAtPath(prev, path, value))}
        />
      </div>

      {saveError && <p className="mt-4 text-sm text-critical">{saveError}</p>}

      <div className="mt-4">
        <Button variant="primary" size="md" loading={saving} onClick={handleSave}>
          Guardar borrador
        </Button>
      </div>
    </div>
  )
}
