import { useState } from 'react'
import { Badge } from '@/design-system/primitives/Badge'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import { useDivipolaHistory, useDivipolaImport, type DivipolaImportView } from '@/lib/catalog/useTerritorialCatalog'
import { formatDateTime } from '@/lib/format/formatDateTime'

/**
 * SPEC-0110: cargar el archivo del DANE en dos pasos.
 *
 * <p>Mirar y aplicar están separados a propósito: un archivo recortado propondría
 * retirar cientos de municipios de los que cuelgan casos, llamadas y reportes.
 * Por eso los ausentes salen SIN marcar —retirarlos es una decisión, no un
 * efecto de subir un archivo— y el resto del plan se ve antes de escribir nada.
 */
export function DivipolaImportPanel({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [cutoffDate, setCutoffDate] = useState('')
  const [source, setSource] = useState('')
  const [preview, setPreview] = useState<DivipolaImportView | null>(null)
  const [toRetire, setToRetire] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { preview: previewMutation, apply } = useDivipolaImport()
  const history = useDivipolaHistory()

  async function handlePreview() {
    if (!file) return
    setError(null)
    setMessage(null)
    setToRetire([])
    try {
      setPreview(await previewMutation.mutateAsync({ file, cutoffDate: cutoffDate || undefined, source: source || undefined }))
    } catch (err) {
      setPreview(null)
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.')
    }
  }

  async function handleApply() {
    if (!preview) return
    setError(null)
    try {
      const applied = await apply.mutateAsync({
        importId: preview.id,
        fileHash: preview.fileHash,
        retireCodes: toRetire,
      })
      setPreview(null)
      setMessage(
        `Aplicado: ${applied.appliedNew ?? 0} municipios nuevos, ${applied.appliedChanged ?? 0} corregidos y ` +
          `${applied.appliedRetired ?? 0} retirados.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo aplicar la carga.')
    }
  }

  return (
    <section className="mt-4 flex flex-col gap-3 rounded-sm border border-border bg-surface-raised p-4" aria-label="Cargar DIVIPOLA">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary">Cargar el archivo del DANE</h2>
        <a href="/api/v1/admin/catalog/divipola/template.csv" className="text-sm text-accent-hover underline">
          Descargar plantilla
        </a>
      </div>
      <p className="max-w-3xl text-sm text-text-secondary">
        Primero se ve qué cambiaría; nada se escribe hasta confirmar. Los municipios que el archivo no menciona se
        proponen para retirar, y sólo se retiran los que usted marque.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Archivo (.xlsx o .csv)
          <input
            type="file"
            accept=".xlsx,.xls,.csv,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="min-h-[var(--tap-min)] text-sm text-text-secondary file:mr-3 file:min-h-[var(--tap-min)] file:rounded-sm file:border-0 file:bg-surface-sunken file:px-3 file:py-1.5 file:text-sm file:text-text-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Fecha de corte
          <Input type="date" value={cutoffDate} onChange={(event) => setCutoffDate(event.target.value)} className="w-44" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Fuente
          <Input
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="w-64"
            placeholder="DANE — DIVIPOLA 2026"
          />
        </label>
        <Button variant="primary" size="sm" disabled={!file} loading={previewMutation.isPending} onClick={handlePreview}>
          Ver qué cambiaría
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      </div>

      {message && (
        <p role="status" className="text-sm text-stable">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}

      {preview && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="active">{preview.newCount} nuevos</Badge>
            <Badge tone="neutral">{preview.changedCount} con cambios</Badge>
            <Badge tone="neutral">{preview.missingCount} ausentes del archivo</Badge>
            <Badge tone={preview.errorCount > 0 ? 'critical' : 'neutral'}>{preview.errorCount} con error</Badge>
          </div>

          {preview.plan.newMunicipalities.length > 0 && (
            <details open>
              <summary className="cursor-pointer text-sm font-medium text-text-primary">Municipios nuevos</summary>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-text-secondary">
                {preview.plan.newMunicipalities.map((municipality) => (
                  <li key={municipality.code}>
                    <span className="font-mono text-xs">{municipality.code}</span> {municipality.name}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {preview.plan.changed.length > 0 && (
            <details open>
              <summary className="cursor-pointer text-sm font-medium text-text-primary">Cambios</summary>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-text-secondary">
                {preview.plan.changed.map((change) => (
                  <li key={change.code}>
                    <span className="font-mono text-xs">{change.code}</span> {change.currentName} → {change.newName}{' '}
                    <span className="text-text-muted">({change.fields.join(', ')})</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {preview.plan.missing.length > 0 && (
            <details open>
              <summary className="cursor-pointer text-sm font-medium text-text-primary">
                No vienen en el archivo — marque los que deban retirarse
              </summary>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-text-secondary">
                {preview.plan.missing.map((municipality) => (
                  <li key={municipality.code}>
                    <label className="flex min-h-[var(--tap-min)] items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded-xs border-border-strong"
                        checked={toRetire.includes(municipality.code)}
                        onChange={(event) =>
                          setToRetire((previous) =>
                            event.target.checked
                              ? [...previous, municipality.code]
                              : previous.filter((code) => code !== municipality.code),
                          )
                        }
                      />
                      <span className="font-mono text-xs">{municipality.code}</span> {municipality.name}
                      {municipality.alreadyRetired && <span className="text-text-muted">(ya estaba retirado)</span>}
                    </label>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {preview.plan.errors.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-critical">Filas con error</summary>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-critical">
                {preview.plan.errors.map((rowError) => (
                  <li key={`${rowError.rowNumber}-${rowError.message}`}>
                    Fila {rowError.rowNumber}: {rowError.message}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex items-center gap-3">
            <Button variant="primary" size="sm" loading={apply.isPending} onClick={handleApply}>
              Aplicar al catálogo
            </Button>
            <span className="text-xs text-text-secondary">
              Se aplicarán los nuevos y los cambios{toRetire.length > 0 ? `, y se retirarán ${toRetire.length}` : ''}.
            </span>
          </div>
        </div>
      )}

      {(history.data?.length ?? 0) > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-text-primary">Cargas anteriores</summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-text-secondary">
            {(history.data ?? []).map((item) => (
              <li key={item.id}>
                {formatDateTime(item.createdAt)} — {item.fileName} —{' '}
                {item.status === 'APPLIED'
                  ? `aplicada (${item.appliedNew ?? 0} nuevos, ${item.appliedChanged ?? 0} corregidos, ${item.appliedRetired ?? 0} retirados)`
                  : 'sólo vista previa'}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
