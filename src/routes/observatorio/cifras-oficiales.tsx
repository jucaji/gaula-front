import { createFileRoute, redirect } from '@tanstack/react-router'
import { ObservatoryNav } from '@/design-system/patterns/ObservatoryNav'
import { OfficialStatisticsImportPanel } from '@/design-system/domain/OfficialStatisticsImportPanel'
import { Badge } from '@/design-system/primitives/Badge'
import { formatDateTime } from '@/lib/format/formatDateTime'
import {
  OFFICIAL_SERIES,
  formatCount,
  formatDay,
  useOfficialLoads,
  useOfficialSummary,
  type OfficialSeries,
} from '@/lib/observatory/useOfficialStatistics'

export const Route = createFileRoute('/observatorio/cifras-oficiales')({
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'OFFICIAL_STATISTIC')) {
      throw redirect({ to: '/', search: { denied: 'OFFICIAL_STATISTIC' } })
    }
  },
  component: OfficialStatisticsPage,
})

const STATUS: Record<string, string> = {
  PREVIEWED: 'Vista previa',
  ACTIVE: 'Vigente',
  SUPERSEDED: 'Reemplazada',
}

/**
 * SPEC-0808: las cifras oficiales de Mindefensa que hoy se copian a mano al
 * boletín. Esta pantalla responde dos preguntas: qué está vigente y de qué corte,
 * y qué se cargó antes.
 */
function OfficialStatisticsPage() {
  const { can } = Route.useRouteContext()
  const canLoad = can('CREATE', 'OFFICIAL_STATISTIC')

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <ObservatoryNav showSnapshot={false} />
      <header>
        <h1 className="text-lg font-semibold text-text-primary">Cifras oficiales de Mindefensa</h1>
        <p className="max-w-3xl text-sm text-text-secondary">
          Observatorio de Derechos Humanos y Defensa Nacional. La medida es <strong>víctimas</strong>: estos archivos no
          permiten contar casos. Tráfico de migrantes se carga con trata de personas y no suma en los totales.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {OFFICIAL_SERIES.map((series) => (
          <SeriesCard key={series.code} series={series.code} label={series.label} />
        ))}
      </div>

      {canLoad && <OfficialStatisticsImportPanel />}

      <LoadHistory />
    </div>
  )
}

function SeriesCard({ series, label }: { series: OfficialSeries; label: string }) {
  const summary = useOfficialSummary(series)
  const years = (Array.isArray(summary.data?.victimsByYear) ? summary.data.victimsByYear : []).slice(-6).reverse()
  const load = summary.data?.load

  return (
    <section className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4" aria-label={`Cifras de ${label}`}>
      <h2 className="text-sm font-semibold text-text-primary">{label}</h2>
      {summary.isLoading && <p className="text-sm text-text-secondary">Cargando…</p>}
      {summary.isError && <p className="text-sm text-critical">No se pudieron consultar las cifras.</p>}
      {summary.data && !load && (
        <p className="text-sm text-text-secondary">Todavía no se ha cargado ningún archivo de este delito.</p>
      )}
      {load && (
        <>
          <p className="text-xs text-text-secondary">
            Corte al <strong className="text-text-primary">{formatDay(load.cutoffDate)}</strong> · publicado{' '}
            {formatDateTime(load.appliedAt ?? undefined)}
            {load.warnings.includes('PARTIAL_LAST_MONTH') && (
              <>
                {' '}
                · <span className="text-alert">último mes incompleto</span>
              </>
            )}
          </p>
          <table className="text-sm">
            <caption className="sr-only">Víctimas por año de {label}</caption>
            <thead>
              <tr className="text-left text-xs text-text-secondary">
                <th scope="col" className="py-1 font-medium">Año</th>
                <th scope="col" className="py-1 text-right font-medium">Víctimas</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {years.map((year) => (
                <tr key={year.year} className="border-t border-border">
                  <th scope="row" className="py-1 text-left font-normal">
                    {year.year}
                    {load.cutoffDate?.startsWith(String(year.year)) && (
                      <span className="text-text-muted"> (corrido)</span>
                    )}
                  </th>
                  <td className="py-1 text-right">{formatCount(year.victims)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}

function LoadHistory() {
  const loads = useOfficialLoads()
  if (!Array.isArray(loads.data) || loads.data.length === 0) return null

  return (
    <section className="flex flex-col gap-2" aria-label="Historial de cargas">
      <h2 className="text-sm font-semibold text-text-primary">Historial de cargas</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-text-secondary">
              <th scope="col" className="py-1 pr-3 font-medium">Delito</th>
              <th scope="col" className="py-1 pr-3 font-medium">Archivo</th>
              <th scope="col" className="py-1 pr-3 font-medium">Corte</th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">Víctimas</th>
              <th scope="col" className="py-1 pr-3 font-medium">Estado</th>
              <th scope="col" className="py-1 font-medium">Cargado</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {loads.data.map((load) => (
              <tr key={load.id} className="border-t border-border">
                <td className="py-1 pr-3">{load.seriesLabel}</td>
                <td className="max-w-56 truncate py-1 pr-3" title={load.fileName}>{load.fileName}</td>
                <td className="py-1 pr-3">{formatDay(load.cutoffDate)}</td>
                <td className="py-1 pr-3 text-right">{formatCount(load.victims)}</td>
                <td className="py-1 pr-3">
                  <Badge tone={load.status === 'ACTIVE' ? 'stable' : 'neutral'}>{STATUS[load.status] ?? load.status}</Badge>
                </td>
                <td className="py-1">{formatDateTime(load.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
