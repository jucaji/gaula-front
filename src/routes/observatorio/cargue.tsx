import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react'
import { customFetch } from '@/api/client'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import { ObservatoryNav } from '@/design-system/patterns/ObservatoryNav'
import { ACTIVE_SNAPSHOT_KEY } from '@/lib/observatory/useActiveSnapshot'
import type { ImportJobStatus, ImportPreview, ImportProfileSummary, RowFailure } from '@/lib/observatory/types'

export const Route = createFileRoute('/observatorio/cargue')({
  beforeLoad: ({ context }) => {
    if (!context.can('CREATE', 'OBSERVATORY')) {
      throw redirect({ to: '/', search: { denied: 'OBSERVATORY' } })
    }
  },
  component: ObservatoryImportPage,
})

function useImportProfiles() {
  return useQuery({
    queryKey: ['observatory', 'profiles'],
    queryFn: () => customFetch<ImportProfileSummary[]>('/api/v1/observatory/profiles'),
    staleTime: 5 * 60_000,
    networkMode: 'always',
    retry: false,
  })
}

interface ImportForm {
  profileCode: string
  source: string
  cutoffDate: string
  label: string
}

/**
 * S13.FE.01 -- Vía A: cargar la plantilla tal como el analista la llena hoy.
 *
 * <p>El paso de PREVISUALIZAR es el corazón de esta pantalla, no un adorno:
 * hoy el archivo se carga a ciegas y el problema aparece cuando la cifra ya
 * está en la lámina que ve el comando (docs/00 §8.1). Aquí el analista ve
 * cuántas filas entran, cuántas ya estaban y qué fila exacta se rechaza y por
 * qué -- ANTES de escribir una sola fila.
 */
function ObservatoryImportPage() {
  const queryClient = useQueryClient()
  const profiles = useImportProfiles()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [form, setForm] = useState<ImportForm>({
    profileCode: '',
    source: 'Fiscalía General de la Nación',
    cutoffDate: '',
    label: '',
  })
  const [fileName, setFileName] = useState<string | null>(null)
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [job, setJob] = useState<ImportJobStatus | null>(null)

  // El perfil elegido se DERIVA: mientras el analista no escoja, vale el primero
  // que el backend reporte. Sembrarlo con un efecto provocaría un render en
  // cascada y dejaría el estado y la pantalla desfasados un ciclo.
  const profileCode = form.profileCode || profiles.data?.[0]?.code || ''
  const selectedProfile = profiles.data?.find((profile) => profile.code === profileCode)

  // Un intervalo que sobrevive al desmontaje seguiría pegándole al backend desde
  // una pantalla que ya nadie mira.
  useEffect(() => () => stopPolling(), [])

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  function importParams(): URLSearchParams | null {
    if (!profileCode || !form.source.trim() || !form.cutoffDate) return null
    const params = new URLSearchParams({
      profileCode,
      source: form.source.trim(),
      cutoffDate: form.cutoffDate,
    })
    if (form.label.trim()) params.set('label', form.label.trim())
    return params
  }

  function selectedFile(): File | null {
    return fileInputRef.current?.files?.[0] ?? null
  }

  async function handlePreview() {
    const params = importParams()
    const file = selectedFile()
    if (!params || !file) {
      setError('Faltan datos: escoja el archivo, la plantilla, la fuente y la fecha de corte.')
      return
    }
    setBusy('preview')
    setError(null)
    setJob(null)
    try {
      const body = new FormData()
      body.append('file', file)
      setPreview(
        await customFetch<ImportPreview>(`/api/v1/observatory/imports/preview?${params.toString()}`, {
          method: 'POST',
          body,
        }),
      )
    } catch (err) {
      setPreview(null)
      setError(err instanceof Error ? err.message : 'No se pudo previsualizar el archivo.')
    } finally {
      setBusy(null)
    }
  }

  async function pollStatus(jobId: string) {
    try {
      const status = await customFetch<ImportJobStatus>(`/api/v1/observatory/imports/${jobId}`)
      setJob(status)
      if (status.status === 'DONE' || status.status === 'FAILED') {
        stopPolling()
        if (status.status === 'DONE') {
          // La banda de vigencia y la tabla de hechos quedan mostrando el corte anterior si no se invalidan.
          await queryClient.invalidateQueries({ queryKey: ACTIVE_SNAPSHOT_KEY })
          await queryClient.invalidateQueries({ queryKey: ['observatory', 'incidents'] })
        }
      }
    } catch {
      stopPolling()
      setError('Se perdió el seguimiento del cargue. Consulte la pestaña Hechos para ver qué quedó registrado.')
    }
  }

  async function handleImport() {
    const params = importParams()
    const file = selectedFile()
    if (!params || !file) return
    setBusy('import')
    setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const accepted = await customFetch<{ jobId: string }>(`/api/v1/observatory/imports?${params.toString()}`, {
        method: 'POST',
        body,
      })
      setJob({ jobId: accepted.jobId, status: 'PROCESSING', requestedAt: new Date().toISOString() })
      pollRef.current = setInterval(() => void pollStatus(accepted.jobId), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar el cargue.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ObservatoryNav />

      <h1 className="text-lg font-semibold text-text-primary">Cargar plantilla del registro nacional</h1>
      <p className="mt-1 max-w-3xl text-sm text-text-secondary">
        Vía A: se sube el archivo tal como se llena hoy. Recargar el mismo archivo no duplica nada — las filas que ya
        estaban se cuentan como omitidas.
      </p>

      <div className="mt-4 grid max-w-3xl gap-3 rounded-sm border border-border-strong bg-surface-raised p-4">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Plantilla
          <select
            aria-label="Plantilla"
            value={profileCode}
            onChange={(event) => setForm({ ...form, profileCode: event.target.value })}
            className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
          >
            {profiles.data?.map((profile) => (
              <option key={profile.code} value={profile.code}>
                {profile.displayName} (v{profile.version})
              </option>
            ))}
          </select>
        </label>

        {selectedProfile && (
          <p className="text-2xs text-text-muted">
            Hojas que se van a leer: {selectedProfile.sheets.join(', ') || '—'}. Cualquier otra hoja del libro se ignora.
          </p>
        )}

        {selectedProfile?.provisional && (
          <p className="flex items-start gap-2 text-2xs text-alert">
            <AlertTriangle size={14} strokeWidth={1.5} className="mt-px shrink-0" aria-hidden />
            <span>
              Mapeo provisional: se construyó a partir de una captura parcial de la plantilla. Las columnas que no estén
              mapeadas no se leen — revise la previsualización antes de confirmar.
            </span>
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Fuente
            <Input
              value={form.source}
              onChange={(event) => setForm({ ...form, source: event.target.value })}
              placeholder="Fiscalía General de la Nación"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Fecha de corte
            <Input
              type="date"
              value={form.cutoffDate}
              onChange={(event) => setForm({ ...form, cutoffDate: event.target.value })}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Etiqueta de la mesa (opcional)
          <Input
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
            placeholder="Mesa de Seguimiento No.52"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Archivo (.xlsx)
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            aria-label="Archivo"
            onChange={(event) => {
              setFileName(event.target.files?.[0]?.name ?? null)
              setPreview(null)
              setJob(null)
            }}
            className="min-h-[var(--tap-min)] text-sm text-text-primary"
          />
        </label>

        {fileName && (
          <p className="flex items-center gap-2 text-2xs text-text-muted">
            <FileSpreadsheet size={14} strokeWidth={1.5} aria-hidden /> {fileName}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md" loading={busy === 'preview'} onClick={handlePreview}>
            Previsualizar
          </Button>
          <Button
            variant="primary"
            size="md"
            loading={busy === 'import'}
            disabled={!preview || job?.status === 'PROCESSING'}
            onClick={handleImport}
          >
            Confirmar cargue
          </Button>
        </div>
        {!preview && (
          <p className="text-2xs text-text-muted">
            El cargue se habilita después de previsualizar: nadie escribe un corte sin haber visto qué entra.
          </p>
        )}
      </div>

      {error && (
        <p className="mt-3 max-w-3xl text-sm text-critical" role="alert">
          {error}
        </p>
      )}

      {preview && <PreviewReport preview={preview} />}

      {job && <JobReport job={job} />}
    </div>
  )
}

function Figure({ value, label, tone }: { value: number; label: string; tone?: 'alert' | 'muted' }) {
  return (
    <div className="rounded-sm border border-border bg-surface px-3 py-2">
      <p
        className={
          tone === 'alert'
            ? 'font-mono text-lg font-semibold text-alert'
            : 'font-mono text-lg font-semibold text-text-primary'
        }
      >
        {value.toLocaleString('es-CO')}
      </p>
      <p className="text-2xs text-text-secondary">{label}</p>
    </div>
  )
}

function FailureList({ failures }: { failures: RowFailure[] }) {
  return (
    <div className="mt-3">
      <p className="text-2xs font-semibold uppercase text-alert">Filas rechazadas</p>
      <p className="text-2xs text-text-muted">
        Cada una dice qué campo y por qué. Las demás filas del archivo no se ven afectadas.
      </p>
      <ul className="mt-1 space-y-0.5 text-2xs text-text-secondary">
        {failures.map((failure) => (
          <li key={`${failure.sheetName}-${failure.rowNumber}`}>
            <span className="font-mono text-text-primary">
              {failure.sheetName} · fila {failure.rowNumber}
            </span>
            : {failure.reason}
          </li>
        ))}
      </ul>
    </div>
  )
}

function PreviewReport({ preview }: { preview: ImportPreview }) {
  return (
    <section className="mt-4 max-w-3xl rounded-sm border border-border-strong bg-surface-raised p-4">
      <h2 className="text-sm font-semibold text-text-primary">Previsualización — no se escribió nada todavía</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Figure value={preview.totalRows} label="Filas leídas" />
        <Figure value={preview.created} label="Nuevas" />
        <Figure value={preview.skipped} label="Ya estaban" />
        <Figure value={preview.unresolvedMunicipalities} label="Municipio sin resolver" tone="alert" />
        <Figure value={preview.failures.length} label="Rechazadas" tone="alert" />
      </div>
      {preview.unresolvedMunicipalities > 0 && (
        <p className="mt-2 text-2xs text-text-secondary">
          Los hechos con municipio sin resolver SÍ se guardan, con el texto original intacto — el sistema nunca adivina
          un municipio. Se corrigen desde Hechos, sin volver al Excel.
        </p>
      )}
      {preview.failures.length > 0 && <FailureList failures={preview.failures} />}
    </section>
  )
}

function JobReport({ job }: { job: ImportJobStatus }) {
  return (
    <section className="mt-4 max-w-3xl rounded-sm border border-border-strong bg-surface-raised p-4">
      <h2 className="text-sm font-semibold text-text-primary">Cargue</h2>

      {(job.status === 'PROCESSING' || job.status === 'PENDING') && (
        <p className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden /> Procesando el archivo…
        </p>
      )}

      {job.status === 'FAILED' && (
        <p className="mt-2 flex items-start gap-2 text-sm text-critical" role="alert">
          <AlertTriangle size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden />
          Falló el cargue: {job.errorMessage ?? 'sin detalle'}. El corte anterior sigue vigente.
        </p>
      )}

      {job.status === 'DONE' && (
        <>
          <p className="mt-2 flex items-center gap-2 text-sm text-text-primary">
            <CheckCircle2 size={16} strokeWidth={1.5} className="text-stable" aria-hidden />
            {(job.createdRows ?? 0).toLocaleString('es-CO')} hechos nuevos y{' '}
            {(job.skippedRows ?? 0).toLocaleString('es-CO')} que ya estaban, de{' '}
            {(job.totalRows ?? 0).toLocaleString('es-CO')} filas leídas.
          </p>
          {(job.failures?.length ?? 0) > 0 && <FailureList failures={job.failures ?? []} />}
        </>
      )}
    </section>
  )
}
