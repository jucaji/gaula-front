import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { z } from 'zod'
import type { EChartsOption } from 'echarts'
import { customFetch } from '@/api/client'
import type { CrimeTypeResponse, KpiComparisonResponse, TimeSeriesPointResponse } from '@/api/generated/models'
import { KpiTile } from '@/design-system/domain/KpiTile'
import { ChartWithTable } from '@/design-system/patterns/ChartWithTable'
import { EchartsChart } from '@/design-system/charts/EchartsChart'
import { getCategoricalPalette, getDivergingPalette, foldIntoOthers } from '@/design-system/charts/palette'
import { useResolvedTheme } from '@/lib/theme/useResolvedTheme'
import { Input } from '@/design-system/primitives/Input'
import { Button } from '@/design-system/primitives/Button'
import { formatCurrencyCOP } from '@/lib/format/formatDateTime'
import { Info } from 'lucide-react'

const METRICS = ['REPORT_COUNT', 'ARRESTS', 'RESCUES', 'PREVENTED_PAYMENT_AMOUNT', 'WEAPONS_SEIZED', 'VEHICLES_SEIZED'] as const
const METRIC_LABEL: Record<string, string> = {
  REPORT_COUNT: 'Reportes',
  ARRESTS: 'Capturas',
  RESCUES: 'Rescates',
  PREVENTED_PAYMENT_AMOUNT: 'Dinero dejado de pagar',
  WEAPONS_SEIZED: 'Armas incautadas',
  VEHICLES_SEIZED: 'Vehículos incautados',
}
const GRANULARITIES = ['DAY', 'WEEK', 'MONTH'] as const

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Sin filtro de fecha explícito, el tablero mira los últimos 30 días -- nunca "todo". */
function defaultRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - 29)
  return { from: isoDate(from), to: isoDate(to) }
}

const dashboardSearchSchema = z.object({
  from: z.string().catch(() => defaultRange().from),
  to: z.string().catch(() => defaultRange().to),
  territorialUnitId: z.string().optional(),
  crimeTypeCode: z.string().optional(),
  metric: z.enum(METRICS).catch('REPORT_COUNT'),
  granularity: z.enum(GRANULARITIES).catch('DAY'),
})

type DashboardSearch = z.infer<typeof dashboardSearchSchema>

export const Route = createFileRoute('/analitica/')({
  validateSearch: dashboardSearchSchema,
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'ANALYTICS')) {
      throw redirect({ to: '/', search: { denied: 'ANALYTICS' } })
    }
  },
  component: AnalyticsDashboardPage,
})

/** El período de comparación es el tramo inmediatamente anterior, de igual duración. */
function previousRange(from: string, to: string): { from: string; to: string } {
  const fromDate = new Date(from)
  const toDate = new Date(to)
  const spanMs = toDate.getTime() - fromDate.getTime()
  const previousTo = new Date(fromDate.getTime() - 24 * 60 * 60 * 1000)
  const previousFrom = new Date(previousTo.getTime() - spanMs)
  return { from: isoDate(previousFrom), to: isoDate(previousTo) }
}

function useCrimeTypes() {
  return useQuery({
    queryKey: ['catalog', 'crime-types'],
    queryFn: () => customFetch<CrimeTypeResponse[]>('/api/v1/catalog/crime-types'),
    staleTime: Infinity,
    networkMode: 'always',
    retry: false,
  })
}

function useKpiComparison(params: {
  currentFrom: string
  currentTo: string
  previousFrom: string
  previousTo: string
  territorialUnitId?: string | undefined
}) {
  return useQuery({
    queryKey: ['analytics', 'kpi-compare', params],
    queryFn: () => {
      const search = new URLSearchParams({
        currentFrom: params.currentFrom,
        currentTo: params.currentTo,
        previousFrom: params.previousFrom,
        previousTo: params.previousTo,
      })
      if (params.territorialUnitId) search.set('territorialUnitId', params.territorialUnitId)
      return customFetch<KpiComparisonResponse>(`/api/v1/analytics/kpi/compare?${search.toString()}`)
    },
    staleTime: 15_000,
    networkMode: 'always',
    retry: false,
  })
}

function useSeries(params: DashboardSearch) {
  return useQuery({
    queryKey: ['analytics', 'series', params],
    queryFn: () => {
      const search = new URLSearchParams({ metric: params.metric, granularity: params.granularity, from: params.from, to: params.to })
      if (params.territorialUnitId) search.set('territorialUnitId', params.territorialUnitId)
      if (params.crimeTypeCode) search.set('crimeTypeCode', params.crimeTypeCode)
      return customFetch<TimeSeriesPointResponse[]>(`/api/v1/analytics/series?${search.toString()}`)
    },
    staleTime: 15_000,
    networkMode: 'always',
    retry: false,
  })
}

/** S11.ADI.03/E2.6: mismo patrón de descarga que `ExportReferralPdfButton` (Sprint 5) -- Blob + <a download> temporal. */
function ExportComparisonButton(props: { currentFrom: string; currentTo: string; previousFrom: string; previousTo: string; territorialUnitId?: string | undefined }) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    setError(null)
    try {
      const search = new URLSearchParams({
        currentFrom: props.currentFrom,
        currentTo: props.currentTo,
        previousFrom: props.previousFrom,
        previousTo: props.previousTo,
      })
      if (props.territorialUnitId) search.set('territorialUnitId', props.territorialUnitId)
      const blob = await customFetch<Blob>(`/api/v1/analytics/kpi/compare/export?${search.toString()}`)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `comparativo-${props.currentFrom}-a-${props.currentTo}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo exportar el comparativo.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-2xs text-critical">{error}</span>}
      <button type="button" onClick={handleExport} disabled={exporting} className="text-2xs font-medium text-accent hover:text-accent-hover disabled:opacity-50">
        {exporting ? 'Exportando…' : 'Exportar comparativo'}
      </button>
    </span>
  )
}

function AnalyticsDashboardPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { can } = Route.useRouteContext()
  const theme = useResolvedTheme()
  const crimeTypes = useCrimeTypes()

  const previous = useMemo(() => previousRange(search.from, search.to), [search.from, search.to])

  const kpiCompare = useKpiComparison({
    currentFrom: search.from,
    currentTo: search.to,
    previousFrom: previous.from,
    previousTo: previous.to,
    territorialUnitId: search.territorialUnitId,
  })
  const series = useSeries(search)

  const categoricalPalette = getCategoricalPalette(theme)
  const diverging = getDivergingPalette(theme)

  const seriesRows = series.data ?? []
  const primarySeriesColor = categoricalPalette[0] ?? '#00997f'
  const seriesOption: EChartsOption = {
    grid: { left: 48, right: 16, top: 24, bottom: 32 },
    xAxis: { type: 'category', data: seriesRows.map((point) => point.bucket ?? ''), axisLine: { lineStyle: { color: '#9ca3af' } } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } } },
    tooltip: { trigger: 'axis' },
    series: [
      {
        type: 'line',
        data: seriesRows.map((point) => point.value ?? 0),
        smooth: false,
        symbolSize: 6,
        lineStyle: { width: 2, color: primarySeriesColor },
        itemStyle: { color: primarySeriesColor },
      },
    ],
  }

  const modalityRows = (kpiCompare.data?.byModality ?? []).map((item) => ({
    crimeTypeCode: item.crimeTypeCode ?? '—',
    current: item.current?.reportCount ?? 0,
    previous: item.previous?.reportCount ?? 0,
    sortKey: item.current?.reportCount ?? 0,
  }))
  const foldedModality = foldIntoOthers(modalityRows, 7, (rest) => ({
    crimeTypeCode: 'Otros',
    current: rest.reduce((sum, item) => sum + item.current, 0),
    previous: rest.reduce((sum, item) => sum + item.previous, 0),
    sortKey: 0,
  }))

  const modalityOption: EChartsOption = {
    grid: { left: 48, right: 16, top: 24, bottom: 48 },
    legend: { data: ['Período actual', 'Período anterior'], bottom: 0 },
    xAxis: { type: 'category', data: foldedModality.map((item) => item.crimeTypeCode) },
    yAxis: { type: 'value' },
    tooltip: { trigger: 'axis' },
    series: [
      { name: 'Período actual', type: 'bar', data: foldedModality.map((item) => item.current), itemStyle: { color: diverging.positive, borderRadius: [4, 4, 0, 0] } },
      { name: 'Período anterior', type: 'bar', data: foldedModality.map((item) => item.previous), itemStyle: { color: diverging.mid, borderRadius: [4, 4, 0, 0] } },
    ],
  }

  const currentTotal = kpiCompare.data?.currentTotal
  const previousTotal = kpiCompare.data?.previousTotal

  /**
   * HALLAZGO REAL (2026-09-08): las seis tarjetas mostraban `0` / `$ 0` cuando
   * no había NINGÚN reporte validado en el rango, y eso no es lo mismo.
   *
   * `mv_daily_kpi` sólo cuenta reportes en estado `VALIDATED` (SPEC-0405 CA-1),
   * así que un tablero recién puesto en marcha -- o una unidad cuyo comandante
   * todavía no ha validado nada -- se ve idéntico a una unidad que trabajó y no
   * obtuvo un solo resultado. Un comandante que abra esto puede leer "no
   * hicimos nada este mes", que es una afirmación sobre la operación que este
   * tablero no está en condiciones de hacer.
   *
   * Es el mismo defecto que se corrigió en el observatorio (SPEC-0803 CA-5); la
   * diferencia es que aquí venía desde el Sprint 7 y nadie lo había visto porque
   * el entorno siempre tuvo datos... hasta que dejó de tenerlos.
   */
  const hasValidatedReports = (currentTotal?.reportCount ?? 0) > 0 || (previousTotal?.reportCount ?? 0) > 0

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Analítica</h1>
        <div className="flex items-center gap-3">
          <Button asChild variant="secondary" size="sm">
            <Link to="/analitica/carga-147">Carga de la 147</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/analitica/mapa">Mapa de calor</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Desde
          <Input
            size="sm"
            type="date"
            value={search.from}
            onChange={(event) => void navigate({ search: (prev) => ({ ...prev, from: event.target.value }) })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Hasta
          <Input
            size="sm"
            type="date"
            value={search.to}
            onChange={(event) => void navigate({ search: (prev) => ({ ...prev, to: event.target.value }) })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Unidad territorial (id)
          <Input
            size="sm"
            value={search.territorialUnitId ?? ''}
            onChange={(event) => void navigate({ search: (prev) => ({ ...prev, territorialUnitId: event.target.value || undefined }) })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Tipología
          <select
            value={search.crimeTypeCode ?? ''}
            onChange={(event) => void navigate({ search: (prev) => ({ ...prev, crimeTypeCode: event.target.value || undefined }) })}
            className="h-[var(--control-height-sm)] rounded-sm border border-border-strong bg-surface px-2 text-xs text-text-primary"
          >
            <option value="">Todas</option>
            {crimeTypes.data?.map((ct) => (
              <option key={ct.code} value={ct.code}>
                {ct.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Métrica de la serie
          <select
            value={search.metric}
            onChange={(event) => void navigate({ search: (prev) => ({ ...prev, metric: event.target.value as DashboardSearch['metric'] }) })}
            className="h-[var(--control-height-sm)] rounded-sm border border-border-strong bg-surface px-2 text-xs text-text-primary"
          >
            {METRICS.map((metric) => (
              <option key={metric} value={metric}>
                {METRIC_LABEL[metric]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Granularidad
          <select
            value={search.granularity}
            onChange={(event) => void navigate({ search: (prev) => ({ ...prev, granularity: event.target.value as DashboardSearch['granularity'] }) })}
            className="h-[var(--control-height-sm)] rounded-sm border border-border-strong bg-surface px-2 text-xs text-text-primary"
          >
            {GRANULARITIES.map((granularity) => (
              <option key={granularity} value={granularity}>
                {granularity}
              </option>
            ))}
          </select>
        </label>
      </div>

      {kpiCompare.isSuccess && !hasValidatedReports ? (
        <div className="flex items-start gap-2 rounded-sm border border-border-strong bg-surface-raised p-4">
          <Info size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-text-primary">No hay reportes validados en este rango</p>
            <p className="mt-1 max-w-2xl text-sm text-text-secondary">
              Este tablero cuenta únicamente reportes operacionales <strong>validados</strong> por un comandante de
              unidad. Que no haya cifras no significa que no haya habido operaciones: significa que ninguna quedó
              validada en este período con estos filtros.
            </p>
            <p className="mt-2 text-2xs text-text-muted">
              Los reportes en borrador o en revisión no se cuentan aquí a propósito — una cifra que el comando aún no
              avaló no puede publicarse como resultado.
            </p>
            <Button className="mt-3" asChild variant="secondary" size="sm">
              <Link to="/reportes/revision" search={{ status: 'NEEDS_REVIEW', page: 0, size: 20 }}>
                Ver la cola de revisión
              </Link>
            </Button>
          </div>
        </div>
      ) : (
      <section aria-label="Cifras del período" className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        <KpiTile label="Reportes" value={currentTotal?.reportCount ?? 0} previousValue={previousTotal?.reportCount} />
        <KpiTile label="Capturas" value={currentTotal?.arrests ?? 0} previousValue={previousTotal?.arrests} />
        <KpiTile label="Rescates" value={currentTotal?.rescues ?? 0} previousValue={previousTotal?.rescues} />
        <KpiTile
          label="Dinero dejado de pagar"
          value={currentTotal?.preventedPaymentAmount ?? 0}
          previousValue={previousTotal?.preventedPaymentAmount}
          format={formatCurrencyCOP}
        />
        <KpiTile label="Armas incautadas" value={currentTotal?.weaponsSeized ?? 0} previousValue={previousTotal?.weaponsSeized} />
        <KpiTile label="Vehículos incautados" value={currentTotal?.vehiclesSeized ?? 0} previousValue={previousTotal?.vehiclesSeized} />
      </section>
      )}

      <ChartWithTable
        title={`${METRIC_LABEL[search.metric]} por ${search.granularity === 'DAY' ? 'día' : search.granularity === 'WEEK' ? 'semana' : 'mes'}`}
        chart={<EchartsChart option={seriesOption} ariaLabel={`Serie de tiempo de ${METRIC_LABEL[search.metric]}`} />}
        rows={seriesRows}
        columns={[
          { header: 'Período', cell: (row) => row.bucket ?? '—' },
          { header: 'Valor', cell: (row) => (row.value ?? 0).toLocaleString('es-CO') },
        ]}
        getRowKey={(row, index) => row.bucket ?? String(index)}
      />

      <ChartWithTable
        title="Reportes por tipología -- período actual vs. anterior"
        chart={<EchartsChart option={modalityOption} ariaLabel="Comparativo de reportes por tipología" />}
        rows={foldedModality}
        columns={[
          { header: 'Tipología', cell: (row) => row.crimeTypeCode },
          { header: 'Período actual', cell: (row) => row.current.toLocaleString('es-CO') },
          { header: 'Período anterior', cell: (row) => row.previous.toLocaleString('es-CO') },
        ]}
        getRowKey={(row) => row.crimeTypeCode}
        actions={
          can('EXPORT', 'ANALYTICS') && (
            <ExportComparisonButton
              currentFrom={search.from}
              currentTo={search.to}
              previousFrom={previous.from}
              previousTo={previous.to}
              territorialUnitId={search.territorialUnitId}
            />
          )
        }
      />
    </div>
  )
}
