import { useCallback, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Download } from 'lucide-react'
import type * as echarts from 'echarts'
import { EchartsChart } from '@/design-system/charts/EchartsChart'
import { IncidentMap } from '@/design-system/charts/IncidentMap'
import { IncidentAnalysisPanel } from '@/design-system/domain/IncidentAnalysisPanel'
import { historyOption, monthlyOption, territoryOption, yearToDateOption } from '@/design-system/charts/crimeSheetOptions'
import { ChartWithTable } from '@/design-system/patterns/ChartWithTable'
import { EmptyState } from '@/design-system/patterns/EmptyState'
import { ObservatoryNav } from '@/design-system/patterns/ObservatoryNav'
import { Button } from '@/design-system/primitives/Button'
import { useDepartmentGeometry } from '@/lib/catalog/useDepartmentGeometry'
import { formatDateTime } from '@/lib/format/formatDateTime'
import { formatDay } from '@/lib/observatory/useOfficialStatistics'
import {
  INDICATORS,
  MONTHS,
  downloadSheetPdf,
  formatPercent,
  formatShortDay,
  formatSigned,
  formatVictims,
  useCrimeSheet,
  useCrimeSheetAnalysis,
  type CrimeSheet,
  type TerritoryPeriod,
  type Variation,
} from '@/lib/observatory/useCrimeSheet'
import { useResolvedTheme } from '@/lib/theme/useResolvedTheme'

interface CrimeSheetScreenProps {
  slug: string
  departmentCode: string | undefined
  period: TerritoryPeriod
  canLoad: boolean
  onDepartmentChange: (departmentCode: string | undefined) => void
  onPeriodChange: (period: TerritoryPeriod) => void
}

/**
 * SPEC-0809: la ficha de un delito, con la forma de la página del boletín de
 * Mindefensa —histórico, corrido del año, comparativo mensual, variación— y
 * sin sus errores: meses futuros sin barra, mes de corte marcado parcial y el
 * corrido comparando la misma ventana en cada año.
 */
export function CrimeSheetScreen({ slug, departmentCode, period, canLoad, onDepartmentChange, onPeriodChange }: CrimeSheetScreenProps) {
  const indicator = INDICATORS.find((candidate) => candidate.slug === slug) ?? INDICATORS[0]!
  const sheet = useCrimeSheet(indicator.code, departmentCode, period)
  const theme = useResolvedTheme()
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const data = sheet.data
  const analysis = useCrimeSheetAnalysis(indicator.code, departmentCode, data?.available === true)

  async function handleDownload() {
    setDownloading(true)
    setDownloadError(null)
    try {
      await downloadSheetPdf(indicator.code, departmentCode, period,
        `ficha-${indicator.slug}${departmentCode ? `-${departmentCode}` : ''}.pdf`)
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'No se pudo descargar la ficha.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <ObservatoryNav showSnapshot={false} />

      <nav aria-label="Delitos" className="flex flex-wrap gap-1">
        {INDICATORS.filter((candidate) => !candidate.hidden || candidate.slug === slug).map((candidate) => (
          <Link
            key={candidate.slug}
            to="/tableros/cifras-oficiales/$indicador"
            params={{ indicador: candidate.slug }}
            search={{ departamento: departmentCode, periodo: period === 'LAST_FULL_YEAR' ? 'anio' : undefined }}
            aria-current={candidate.slug === slug ? 'page' : undefined}
            className="flex min-h-[var(--tap-min)] items-center rounded-sm border border-border px-3 text-sm text-text-secondary hover:text-text-primary aria-[current=page]:border-accent aria-[current=page]:bg-surface-raised aria-[current=page]:font-medium aria-[current=page]:text-text-primary"
          >
            {candidate.label}
          </Link>
        ))}
      </nav>

      {sheet.isLoading && <p className="text-sm text-text-secondary">Cargando la ficha…</p>}
      {sheet.isError && (
        <p role="alert" className="text-sm text-critical">
          {sheet.error instanceof Error ? sheet.error.message : 'No se pudo cargar la ficha.'}
        </p>
      )}

      {data && !data.available && (
        <EmptyState
          title={`Todavía no hay cifras oficiales de ${indicator.label.toLowerCase()}`}
          description="Se cargan desde el archivo de Mindefensa en Observatorio › Cifras oficiales."
          action={canLoad ? <Link to="/observatorio/cifras-oficiales" className="inline-flex min-h-[var(--tap-min)] items-center text-sm text-accent-hover underline">Ir a cargar</Link> : undefined}
        />
      )}

      {data?.available && data.cutoffDate && (
        <>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-text-primary">
                {data.indicatorLabel}
                {data.department && <span className="text-text-secondary"> · {data.department.name}</span>}
              </h1>
              {data.department && (
                <button type="button" onClick={() => onDepartmentChange(undefined)} className="min-h-[var(--tap-min)] text-sm text-accent hover:underline">
                  ← Volver al país
                </button>
              )}
              <p className="text-sm text-text-secondary">
                Corte al <strong className="text-text-primary">{formatDay(data.cutoffDate)}</strong>
                {data.partialCutoffMonth && <span className="text-alert"> · {MONTHS[Number(data.cutoffDate.slice(5, 7)) - 1]} incompleto</span>}
                {' · '}Fuente: {data.source}
                {data.publishedAt && <> · publicado {formatDateTime(data.publishedAt)}</>}
              </p>
              <p className="text-xs text-text-muted">Medida: víctimas. Estos datos no permiten contar casos. Cifras preliminares sujetas a variación.</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Button variant="secondary" size="sm" loading={downloading} onClick={handleDownload}>
                <Download size={16} aria-hidden />
                <span className="ml-1">Descargar ficha (PDF)</span>
              </Button>
              {downloadError && <p role="alert" className="text-xs text-critical">{downloadError}</p>}
            </div>
          </header>

          {data.notes.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-sm border border-border bg-surface-raised p-3 text-sm text-text-secondary">
              {data.notes.map((note) => (
                <li key={note.effectiveOn}>
                  <strong className="text-text-primary">Nota metodológica ({formatDay(note.effectiveOn)}):</strong> {note.label}
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartWithTable
              title="Histórico — años completos"
              chart={<EchartsChart ariaLabel={`Víctimas de ${data.indicatorLabel} por año completo`} option={historyOption(data.history, data.notes, theme)} height={280} />}
              rows={data.history}
              getRowKey={(row) => String(row.year)}
              columns={[
                { header: 'Año', cell: (row) => row.year },
                { header: 'Víctimas', cell: (row) => formatVictims(row.victims) },
              ]}
            />
            <ChartWithTable
              title={`Corrido del año — 1 ene al ${formatShortDay(data.cutoffDate)} de cada año`}
              chart={<EchartsChart ariaLabel={`Víctimas de ${data.indicatorLabel} entre el 1 de enero y el ${formatShortDay(data.cutoffDate)} de cada año`} option={yearToDateOption(data.yearToDate, data.cutoffDate, data.notes, theme)} height={280} />}
              rows={data.yearToDate}
              getRowKey={(row) => String(row.year)}
              columns={[
                { header: 'Año', cell: (row) => row.year },
                { header: `Víctimas 1 ene – ${formatShortDay(data.cutoffDate)}`, cell: (row) => formatVictims(row.victims) },
              ]}
            />
            <ChartWithTable
              title={`Comparativo mensual ${data.previousYear} – ${data.currentYear}`}
              chart={<EchartsChart ariaLabel={`Víctimas por mes, ${data.previousYear} contra ${data.currentYear}`} option={monthlyOption(data.monthly, data.previousYear, data.currentYear, data.cutoffDate, theme)} height={280} />}
              rows={data.monthly}
              getRowKey={(row) => String(row.month)}
              columns={[
                { header: 'Mes', cell: (row) => MONTHS[row.month - 1] },
                { header: String(data.previousYear), cell: (row) => formatVictims(row.previous) },
                {
                  header: String(data.currentYear),
                  cell: (row) => (row.current === null ? 'todavía no hay dato' : `${formatVictims(row.current)}${row.partial ? ` (parcial al ${formatShortDay(data.cutoffDate!)})` : ''}`),
                },
              ]}
            />
            <VariationPanel sheet={data} />
          </div>

          <section aria-label="Análisis de la serie" className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-text-primary">Análisis de la serie</h2>
            <p className="max-w-3xl text-sm text-text-secondary">
              Tendencia, variaciones con su margen, municipios que se salen de su propia historia, focos y proyección. Sólo
              meses completos: el mes del corte no entra.
            </p>
            {analysis.isLoading && <p className="text-sm text-text-secondary">Calculando el análisis…</p>}
            {analysis.isError && <p role="alert" className="text-sm text-critical">No se pudo consultar el análisis.</p>}
            {analysis.data && <IncidentAnalysisPanel analysis={analysis.data} unit="víctimas" />}
          </section>

          <TerritorySection sheet={data} period={period} onPeriodChange={onPeriodChange} onDepartmentChange={onDepartmentChange} />

          {!indicator.hidden && (
            <p className="text-sm text-text-secondary">
              Tráfico de migrantes viene en el mismo archivo que trata y no suma en ella.{' '}
              <Link to="/tableros/cifras-oficiales/$indicador" params={{ indicador: 'trafico-de-migrantes' }} search={{}} className="text-accent-hover underline">
                Ver su ficha
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  )
}

function VariationPanel({ sheet }: { sheet: CrimeSheet }) {
  if (!sheet.sameWindow || !sheet.fullMonths) return null
  return (
    <section aria-label="Variación del corrido del año" className="rounded-sm border border-border-strong bg-surface p-3">
      <h2 className="text-sm font-semibold text-text-primary">Variación del corrido del año</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-border text-left text-2xs uppercase text-text-muted">
              <th scope="col" className="py-1 pr-3 font-medium">Comparación</th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">{sheet.previousYear}</th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">{sheet.currentYear}</th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">Var. abs.</th>
              <th scope="col" className="py-1 text-right font-medium">Var. %</th>
            </tr>
          </thead>
          <tbody>
            <VariationRow label={`Misma ventana (1 ene – ${formatShortDay(sheet.sameWindow.currentTo)})`} variation={sheet.sameWindow} strong />
            <VariationRow label={`Como el boletín (ene – ${MONTHS[Number(sheet.fullMonths.previousTo.slice(5, 7)) - 1]} completos)`} variation={sheet.fullMonths} />
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-text-secondary">
        El boletín suma el mes de corte completo en {sheet.previousYear} ({formatShortDay(sheet.fullMonths.previousTo)}) y
        cortado en {sheet.currentYear} ({formatShortDay(sheet.fullMonths.currentTo)}). La primera fila compara los mismos días.
      </p>
    </section>
  )
}

function VariationRow({ label, variation, strong = false }: { label: string; variation: Variation; strong?: boolean }) {
  return (
    <tr className={`border-b border-border ${strong ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>
      <th scope="row" className="py-1 pr-3 text-left font-[inherit]">{label}</th>
      <td className="py-1 pr-3 text-right">{formatVictims(variation.previous)}</td>
      <td className="py-1 pr-3 text-right">{formatVictims(variation.current)}</td>
      <td className="py-1 pr-3 text-right">{formatSigned(variation.absolute)}</td>
      <td className="py-1 text-right">{formatPercent(variation.percent)}</td>
    </tr>
  )
}

function TerritorySection({ sheet, period, onPeriodChange, onDepartmentChange }: {
  sheet: CrimeSheet
  period: TerritoryPeriod
  onPeriodChange: (period: TerritoryPeriod) => void
  onDepartmentChange: (departmentCode: string | undefined) => void
}) {
  const theme = useResolvedTheme()
  const geometry = useDepartmentGeometry(true)
  const national = sheet.territoryLevel === 'DEPARTMENT'
  const level = national ? 'Departamentos' : 'Municipios'
  const range = sheet.territoryFrom && sheet.territoryTo ? `${formatDay(sheet.territoryFrom)} – ${formatDay(sheet.territoryTo)}` : ''

  const handleBarClick = useCallback(
    (params: echarts.ECElementEvent) => {
      if (!national) return
      const territory = sheet.territories.find((candidate) => candidate.name === params.name)
      if (territory) onDepartmentChange(territory.code)
    },
    [national, sheet.territories, onDepartmentChange],
  )

  // El mapa une por nombre; el catálogo lo da con su código, así el clic vuelve a código.
  const departmentCodeByName = useMemo(() => new Map((geometry.data ?? []).map((item) => [item.name, item.code])), [geometry.data])
  const byDepartment = national
    ? sheet.territories.map((territory) => ({ key: territory.name, count: territory.victims }))
    : sheet.department ? [{ key: sheet.department.name, count: sheet.territories.reduce((sum, item) => sum + item.victims, 0) }] : []
  const points = national
    ? []
    : sheet.territories
        .filter((territory) => territory.latitude !== null && territory.longitude !== null)
        .map((territory) => ({ municipalityCode: territory.code, municipalityText: territory.name, count: territory.victims, latitude: territory.latitude!, longitude: territory.longitude! }))
  const total = sheet.territories.reduce((sum, territory) => sum + territory.victims, 0)
  const mappedTotal = national ? total : points.reduce((sum, point) => sum + point.count, 0)

  return (
    <section aria-label={`${level} con víctimas`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-text-primary">{level} · {range}</h2>
        <div role="group" aria-label="Periodo territorial" className="flex gap-1">
          <Button size="sm" variant={period === 'YEAR_TO_DATE' ? 'primary' : 'ghost'} aria-pressed={period === 'YEAR_TO_DATE'} onClick={() => onPeriodChange('YEAR_TO_DATE')}>
            Corrido {sheet.currentYear}
          </Button>
          <Button size="sm" variant={period === 'LAST_FULL_YEAR' ? 'primary' : 'ghost'} aria-pressed={period === 'LAST_FULL_YEAR'} onClick={() => onPeriodChange('LAST_FULL_YEAR')}>
            Año {sheet.previousYear}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartWithTable
          title={`${level} con más víctimas`}
          chart={
            <EchartsChart
              ariaLabel={`${level} ordenados por víctimas${national ? '. Clic en un departamento para ver sus municipios; la tabla ofrece lo mismo con teclado.' : ''}`}
              option={territoryOption(sheet.territories.slice(0, 40), theme)}
              height={Math.max(220, Math.min(sheet.territories.length, 40) * 22 + 40)}
              onClick={national ? handleBarClick : undefined}
            />
          }
          rows={sheet.territories}
          getRowKey={(row) => row.code}
          columns={[
            {
              header: national ? 'Departamento' : 'Municipio',
              cell: (row) =>
                national ? (
                  <button type="button" onClick={() => onDepartmentChange(row.code)} className="text-left text-accent hover:underline">
                    {row.name}
                  </button>
                ) : (
                  row.name
                ),
            },
            { header: 'Víctimas', cell: (row) => formatVictims(row.victims) },
          ]}
        />
        <IncidentMap
          points={points}
          total={total}
          mappedTotal={mappedTotal}
          hotspotMunicipalities={[]}
          anomalyMunicipalities={[]}
          byDepartment={byDepartment}
          selectedDepartment={sheet.department?.name}
          onSelect={() => undefined}
          onSelectDepartment={(name) => {
            const code = name ? departmentCodeByName.get(name) : undefined
            if (code && national) onDepartmentChange(code)
          }}
          defaultView={national ? 'departamentos' : 'puntos'}
        />
      </div>
      {sheet.territories.length > 40 && (
        <p className="text-xs text-text-muted">La gráfica muestra los 40 primeros; la tabla los tiene todos ({sheet.territories.length}).</p>
      )}
    </section>
  )
}
