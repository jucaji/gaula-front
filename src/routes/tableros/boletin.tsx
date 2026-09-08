import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Download } from 'lucide-react'
import { customFetch } from '@/api/client'
import { Button } from '@/design-system/primitives/Button'
import { ObservatoryNav } from '@/design-system/patterns/ObservatoryNav'
import { formatDateTime } from '@/lib/format/formatDateTime'
import { MODALITY_LABEL, VICTIM_STATUS_LABEL, type Breakdown, type Bulletin } from '@/lib/observatory/types'

export const Route = createFileRoute('/tableros/boletin')({
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'OBSERVATORY')) {
      throw redirect({ to: '/', search: { denied: 'OBSERVATORY' } })
    }
  },
  component: BulletinPage,
})

const CUTOFF_DATE = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' })

function useBulletin() {
  return useQuery({
    queryKey: ['observatory', 'bulletin'],
    queryFn: () => customFetch<Bulletin>('/api/v1/observatory/bulletin'),
    staleTime: 30_000,
    networkMode: 'always',
    retry: false,
  })
}

function BreakdownList({ title, rows, label }: { title: string; rows: Breakdown[]; label?: (key: string) => string }) {
  // SPEC-0804: una sección sin datos NO se pinta vacía -- un encabezado sin filas parece un cero.
  if (rows.length === 0) return null
  return (
    <section className="rounded-sm border border-border bg-surface p-3">
      <h2 className="text-2xs font-semibold uppercase tracking-wide text-text-muted">{title}</h2>
      <table className="mt-2 w-full text-left text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border last:border-b-0">
              <td className="py-1 text-text-primary">{label ? label(row.key) : row.key}</td>
              <td className="py-1 text-right font-mono text-text-primary">{row.count.toLocaleString('es-CO')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/**
 * S14.FE.05 — el boletín en pantalla ANTES de descargarlo (SPEC-0804): nadie
 * baja un PDF a ciegas para ver qué trae. Lo que se ve aquí es exactamente lo
 * que sale impreso, porque ambos salen de la misma consulta.
 */
function BulletinPage() {
  const { data: bulletin, isLoading, isError, error } = useBulletin()
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  async function handleDownload() {
    setDownloading(true)
    setDownloadError(null)
    try {
      const blob = await customFetch<Blob>('/api/v1/observatory/bulletin/pdf')
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'boletin-observatorio.pdf'
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'No se pudo descargar el boletín.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ObservatoryNav />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-text-primary">Boletín del corte</h1>
        {bulletin && (
          <Button variant="primary" size="md" loading={downloading} onClick={handleDownload}>
            <Download size={16} strokeWidth={1.5} aria-hidden /> Descargar PDF
          </Button>
        )}
      </div>

      {isLoading && <p className="mt-6 text-sm text-text-secondary">Armando el boletín del corte vigente…</p>}

      {isError && (
        <div className="mt-6 rounded-sm border border-border-strong bg-surface-raised p-4" role="alert">
          <p className="text-sm font-semibold text-text-primary">No se pudo generar el boletín</p>
          <p className="mt-1 max-w-xl text-sm text-text-secondary">
            {error instanceof Error ? error.message : 'Error desconocido.'} Sin un corte vigente el boletín no se
            genera: un PDF de ceros con la fecha de hoy parecería un dato.
          </p>
        </div>
      )}

      {downloadError && (
        <p className="mt-2 text-sm text-critical" role="alert">
          {downloadError}
        </p>
      )}

      {bulletin && (
        <article className="mt-4 max-w-4xl">
          {/* CA-1: la procedencia va ARRIBA de toda cifra, no en un pie de página. */}
          <section className="rounded-sm border border-border-strong bg-surface-raised p-4">
            <p className="text-sm font-semibold text-text-primary">
              Corte al {CUTOFF_DATE.format(new Date(`${bulletin.cutoffDate}T00:00:00`))}
            </p>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-2xs text-text-secondary sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="text-text-muted">Fuente:</dt>
                <dd className="text-text-primary">{bulletin.source}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-text-muted">Etiqueta:</dt>
                <dd className="text-text-primary">{bulletin.label ?? '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-text-muted">Cargado por:</dt>
                <dd className="text-text-primary">{bulletin.loadedByName ?? '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-text-muted">Generado:</dt>
                <dd className="text-text-primary">{formatDateTime(bulletin.generatedAt)}</dd>
              </div>
            </dl>
          </section>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-sm border border-border-strong bg-surface p-3">
              <p className="text-2xs font-medium uppercase tracking-wide text-text-muted">Denuncias por extorsión</p>
              <p className="text-2xl font-semibold text-text-primary">
                {bulletin.extortionTotal.toLocaleString('es-CO')}
              </p>
              {bulletin.previousComparison && (
                <p className="text-2xs text-text-secondary">
                  {bulletin.previousComparison.previousExtortionTotal.toLocaleString('es-CO')} en el corte al{' '}
                  {bulletin.previousComparison.previousCutoffDate}
                </p>
              )}
            </div>
            <div className="rounded-sm border border-border-strong bg-surface p-3">
              <p className="text-2xs font-medium uppercase tracking-wide text-text-muted">Víctimas de secuestro</p>
              <p className="text-2xl font-semibold text-text-primary">
                {bulletin.kidnappingTotal.toLocaleString('es-CO')}
              </p>
              {bulletin.previousComparison && (
                <p className="text-2xs text-text-secondary">
                  {bulletin.previousComparison.previousKidnappingTotal.toLocaleString('es-CO')} en el corte al{' '}
                  {bulletin.previousComparison.previousCutoffDate}
                </p>
              )}
            </div>
          </div>

          {!bulletin.previousComparison && (
            <p className="mt-2 text-2xs text-text-muted">
              No hay un corte anterior comparable, así que el boletín no muestra variación. Un porcentaje contra un
              corte vacío sería una cifra inventada.
            </p>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <BreakdownList title="Principales grupos autores" rows={bulletin.topAuthorGroups} />
            <BreakdownList title="Departamentos con más hechos" rows={bulletin.topDepartments} />
            <BreakdownList
              title="Modalidad de extorsión"
              rows={bulletin.byModality}
              label={(key) => MODALITY_LABEL[key as keyof typeof MODALITY_LABEL] ?? key}
            />
            <BreakdownList
              title="Situación de las víctimas"
              rows={bulletin.byVictimStatus}
              label={(key) => VICTIM_STATUS_LABEL[key as keyof typeof VICTIM_STATUS_LABEL] ?? key}
            />
          </div>
        </article>
      )}
    </div>
  )
}
