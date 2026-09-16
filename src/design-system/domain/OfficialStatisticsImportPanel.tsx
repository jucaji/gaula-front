import { useState } from 'react'
import { Badge } from '@/design-system/primitives/Badge'
import { Button } from '@/design-system/primitives/Button'
import {
  OFFICIAL_SERIES,
  ROW_PROBLEMS,
  WARNINGS,
  formatCount,
  formatDay,
  useOfficialImport,
  type OfficialLoad,
  type OfficialSeries,
} from '@/lib/observatory/useOfficialStatistics'
import { formatDateTime } from '@/lib/format/formatDateTime'

/**
 * SPEC-0808: cargar un archivo de Mindefensa mirando antes de publicar.
 *
 * <p>Lo que decide si se aplica está arriba y en números: víctimas por año contra
 * lo vigente. Una diferencia grande en un año viejo es la señal de que el archivo
 * no es el que se cree, y se tiene que ver antes de reemplazar la cifra del comando.
 */
export function OfficialStatisticsImportPanel() {
  const [series, setSeries] = useState<OfficialSeries>('EXTORTION')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<OfficialLoad | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { preview: previewMutation, apply } = useOfficialImport()

  async function handlePreview() {
    if (!file) return
    setError(null)
    setMessage(null)
    try {
      setPreview(await previewMutation.mutateAsync({ file, series }))
    } catch (err) {
      setPreview(null)
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.')
    }
  }

  async function handleApply() {
    if (!preview || !file) return
    setError(null)
    try {
      const applied = await apply.mutateAsync({ loadId: preview.id, file })
      setPreview(null)
      setMessage(
        `Publicadas las cifras de ${applied.seriesLabel.toLowerCase()} con corte al ${formatDay(applied.cutoffDate)}: ` +
          `${formatCount(applied.victims)} víctimas en ${formatCount(applied.rows)} filas.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar la carga.')
    }
  }

  const blocked = preview !== null && (preview.errorCount > 0 || preview.rows === 0)

  return (
    <section
      className="flex flex-col gap-3 rounded-sm border border-border bg-surface-raised p-4"
      aria-label="Cargar cifras oficiales"
    >
      <h2 className="text-sm font-semibold text-text-primary">Cargar un archivo de Mindefensa</h2>
      <p className="max-w-3xl text-sm text-text-secondary">
        Cada archivo trae la historia completa de su delito y reemplaza la cifra vigente. Primero se ve qué cambiaría;
        nada se publica hasta confirmar. La columna CANTIDAD son víctimas: una fila no es un caso.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Delito del archivo
          <select
            value={series}
            onChange={(event) => {
              setSeries(event.target.value as OfficialSeries)
              setPreview(null)
            }}
            className="h-[var(--control-height-md)] min-h-[var(--tap-min)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
          >
            {OFFICIAL_SERIES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-primary">
          Archivo (.xlsx o .csv)
          <input
            type="file"
            accept=".xlsx,.csv,text/csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null)
              setPreview(null)
            }}
            className="min-h-[var(--tap-min)] text-sm text-text-secondary file:mr-3 file:min-h-[var(--tap-min)] file:rounded-sm file:border-0 file:bg-surface-sunken file:px-3 file:py-1.5 file:text-sm file:text-text-primary"
          />
        </label>
        <Button variant="primary" size="sm" disabled={!file} loading={previewMutation.isPending} onClick={handlePreview}>
          Ver qué cambiaría
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
        <div className="flex flex-col gap-3" aria-label="Vista previa de la carga">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="accent">{formatCount(preview.victims)} víctimas</Badge>
            <Badge tone="neutral">{formatCount(preview.rows)} filas</Badge>
            <Badge tone="neutral">
              {formatDay(preview.firstDate)} → {formatDay(preview.cutoffDate)}
            </Badge>
            <Badge tone={preview.errorCount > 0 ? 'critical' : 'stable'}>
              {formatCount(preview.errorCount)} filas con error
            </Badge>
            <Badge tone={preview.unknownMunicipalityCount > 0 ? 'alert' : 'neutral'}>
              {formatCount(preview.unknownMunicipalityCount)} municipios que el catálogo no conoce
            </Badge>
          </div>

          {preview.warnings.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-alert">
              {preview.warnings.map((warning) => (
                <li key={warning}>{WARNINGS[warning] ?? warning}</li>
              ))}
            </ul>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <table className="text-sm">
              <caption className="mb-1 text-left font-medium text-text-primary">
                Víctimas por año{preview.comparedWithLoadId ? ', contra lo vigente' : ''}
              </caption>
              <thead>
                <tr className="text-left text-xs text-text-secondary">
                  <th scope="col" className="py-1 pr-3 font-medium">Año</th>
                  {preview.comparedWithLoadId && <th scope="col" className="py-1 pr-3 text-right font-medium">Vigente</th>}
                  <th scope="col" className="py-1 pr-3 text-right font-medium">Archivo</th>
                  {preview.comparedWithLoadId && <th scope="col" className="py-1 text-right font-medium">Diferencia</th>}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {(preview.comparedWithLoadId
                  ? preview.comparison.slice().reverse()
                  : preview.victimsByYear
                      .slice()
                      .reverse()
                      .map((year) => ({ year: year.year, previous: null, current: year.victims, difference: null }))
                ).map((row) => (
                  <tr key={row.year} className="border-t border-border">
                    <th scope="row" className="py-1 pr-3 text-left font-normal">{row.year}</th>
                    {preview.comparedWithLoadId && <td className="py-1 pr-3 text-right">{formatCount(row.previous)}</td>}
                    <td className="py-1 pr-3 text-right">{formatCount(row.current)}</td>
                    {preview.comparedWithLoadId && (
                      <td className={`py-1 text-right ${row.difference ? 'font-semibold text-alert' : 'text-text-secondary'}`}>
                        {row.difference === null ? '—' : `${row.difference > 0 ? '+' : ''}${formatCount(row.difference)}`}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            <table className="self-start text-sm">
              <caption className="mb-1 text-left font-medium text-text-primary">Víctimas por conducta (todo el archivo)</caption>
              <thead>
                <tr className="text-left text-xs text-text-secondary">
                  <th scope="col" className="py-1 pr-3 font-medium">Conducta</th>
                  <th scope="col" className="py-1 text-right font-medium">Víctimas</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {preview.victimsByConduct.map((conduct) => (
                  <tr key={conduct.conduct} className="border-t border-border">
                    <th scope="row" className="py-1 pr-3 text-left font-normal">
                      Art. {conduct.article} · {conduct.label}
                      {conduct.hiddenByDefault && <span className="text-text-muted"> (oculto por defecto)</span>}
                    </th>
                    <td className="py-1 text-right">{formatCount(conduct.victims)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.errors.length > 0 && (
            <details open>
              <summary className="cursor-pointer text-sm font-medium text-critical">
                Filas con error ({formatCount(preview.errorCount)})
              </summary>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-critical">
                {preview.errors.map((rowError) => (
                  <li key={`${rowError.rowNumber}-${rowError.problem}`}>
                    Fila {rowError.rowNumber}: {ROW_PROBLEMS[rowError.problem] ?? rowError.problem}
                    {rowError.value && <span className="text-text-secondary"> («{rowError.value}»)</span>}
                  </li>
                ))}
              </ul>
              {preview.errorCount > preview.errors.length && (
                <p className="mt-1 text-xs text-text-secondary">
                  Se muestran las primeras {preview.errors.length}.
                </p>
              )}
            </details>
          )}

          {preview.unknownMunicipalities.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-text-primary">
                Municipios que el catálogo no conoce (se guardan igual, con el nombre del archivo)
              </summary>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-text-secondary">
                {preview.unknownMunicipalities.map((municipality) => (
                  <li key={municipality.code}>
                    <span className="font-mono text-xs">{municipality.code}</span> {municipality.name},{' '}
                    {municipality.departmentName} · {formatCount(municipality.victims)} víctimas
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="sm" disabled={blocked} loading={apply.isPending} onClick={handleApply}>
              Publicar estas cifras
            </Button>
            <span className="text-xs text-text-secondary">
              {blocked
                ? 'No se puede publicar un archivo con filas en error: corríjalo y vuelva a cargarlo.'
                : `Reemplaza las cifras vigentes de ${preview.seriesLabel.toLowerCase()}. La vista previa vence ${formatDateTime(preview.expiresAt)}.`}
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
