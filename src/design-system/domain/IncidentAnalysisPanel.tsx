import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { AlertTriangle, Info, TrendingUp } from 'lucide-react'
import { ChartWithTable } from '@/design-system/patterns/ChartWithTable'
import { EchartsChart } from '@/design-system/charts/EchartsChart'
import { CATEGORICAL_LIGHT, getCategoricalPalette } from '@/design-system/charts/palette'
import { useResolvedTheme } from '@/lib/theme/useResolvedTheme'
import type { IncidentAnalysis } from '@/lib/observatory/types'

const MONTH_LABEL = new Intl.DateTimeFormat('es-CO', { month: 'short', year: '2-digit' })

function formatPct(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(1)} %`
}

/**
 * S15.FE.01 (SPEC-0805): lo que EXPLICA las cifras del tablero.
 *
 * <p>Tres reglas que no son estéticas:
 * <ul>
 *   <li>La proyección se dibuja en una serie APARTE y rotulada (CA-3). Mezclarla
 *       con lo observado convierte un pronóstico en un hecho.</li>
 *   <li>Una variación no significativa se dice con todas sus letras. El
 *       `125.2%` escrito a mano en la lámina de hoy no tiene forma de admitir
 *       que puede ser ruido.</li>
 *   <li>Si el análisis no está, la ausencia se muestra con su motivo (CA-2) --
 *       nunca se calla, porque quien mira no sabría que le falta algo.</li>
 * </ul>
 */
export function IncidentAnalysisPanel({ analysis }: { analysis: IncidentAnalysis }) {
  const theme = useResolvedTheme()
  const categorical = getCategoricalPalette(theme)
  const slot = (index: number) => categorical[index] ?? CATEGORICAL_LIGHT[0]

  const trendOption = useMemo<EChartsOption>(() => {
    const observedMonths = analysis.trend.map((point) => point.month)
    const forecastMonths = analysis.forecast.map((point) => point.month)
    const axis = [...observedMonths, ...forecastMonths].map((month) =>
      MONTH_LABEL.format(new Date(`${month}T00:00:00`)),
    )
    const padding = observedMonths.map(() => null)

    return {
      color: [slot(0), slot(1), slot(3)],
      grid: { left: 48, right: 16, top: 32, bottom: 32 },
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      xAxis: { type: 'category', data: axis },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          name: 'Observado',
          type: 'line',
          symbolSize: 6,
          lineStyle: { width: 2 },
          data: [...analysis.trend.map((point) => point.observed), ...analysis.forecast.map(() => null)],
        },
        {
          name: 'Tendencia',
          type: 'line',
          symbol: 'none',
          lineStyle: { width: 2 },
          data: [...analysis.trend.map((point) => point.trend ?? null), ...analysis.forecast.map(() => null)],
        },
        {
          // Rotulada como proyección en la leyenda y con línea punteada: quien
          // mire la gráfica sin leer la tabla igual tiene que poder distinguirla.
          name: 'Proyección',
          type: 'line',
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { width: 2, type: 'dashed' },
          data: [...padding, ...analysis.forecast.map((point) => point.projected)],
        },
      ],
    }
  }, [analysis, categorical])

  if (!analysis.available) {
    return (
      <section
        aria-label="Análisis estadístico"
        className="mt-3 flex items-start gap-2 rounded-sm border border-border-strong bg-surface-raised p-3"
      >
        <Info size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
        <div className="text-2xs text-text-secondary">
          <p className="text-xs font-semibold text-text-primary">Análisis estadístico no disponible</p>
          <p>
            {analysis.unavailableReason ?? 'Sin motivo informado.'} Las cifras de este tablero están completas: lo
            que falta es la explicación (tendencia, anomalías y proyección), no el dato.
          </p>
        </div>
      </section>
    )
  }

  const trendRows = [
    ...analysis.trend.map((point) => ({
      month: point.month,
      kind: 'Observado',
      value: point.observed,
      band: '—',
    })),
    ...analysis.forecast.map((point) => ({
      month: point.month,
      kind: 'Proyección',
      value: point.projected,
      band: `${point.lower.toFixed(1)} – ${point.upper.toFixed(1)}`,
    })),
  ]

  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <ChartWithTable
        title="Tendencia y proyección"
        chart={<EchartsChart option={trendOption} ariaLabel="Serie observada, tendencia y proyección" />}
        rows={trendRows}
        columns={[
          { header: 'Mes', cell: (row) => row.month },
          { header: 'Tipo', cell: (row) => row.kind },
          { header: 'Hechos', cell: (row) => row.value.toFixed(1) },
          { header: 'Banda', cell: (row) => row.band },
        ]}
        getRowKey={(row, index) => `${row.month}-${row.kind}-${index}`}
      />

      <section
        aria-label="Variaciones"
        className="rounded-sm border border-border-strong bg-surface p-3"
      >
        <h2 className="text-sm font-semibold text-text-primary">Variaciones</h2>
        {analysis.variations.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">No hay dos períodos comparables todavía.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {analysis.variations.map((variation) => (
              <li key={variation.label} className="border-b border-border pb-2 last:border-b-0">
                <p className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
                  <TrendingUp size={14} strokeWidth={1.5} aria-hidden className="text-text-muted" />
                  {variation.label}: <span className="font-mono">{formatPct(variation.changePct)}</span>
                  {/* Nunca sólo color: la conclusión va escrita (docs/06 §3.4). */}
                  <span className={variation.significant ? 'text-2xs font-semibold uppercase text-alert' : 'text-2xs uppercase text-text-muted'}>
                    {variation.significant ? 'significativa' : 'dentro del ruido'}
                  </span>
                </p>
                <p className="text-2xs text-text-secondary">
                  {variation.current.toFixed(0)} contra {variation.previous.toFixed(0)}
                  {variation.lowerPct !== null && variation.lowerPct !== undefined && (
                    <> · intervalo {formatPct(variation.lowerPct)} a {formatPct(variation.upperPct)}</>
                  )}
                </p>
                <p className="text-2xs text-text-muted">{variation.explanation}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Anomalías municipales" className="rounded-sm border border-border-strong bg-surface p-3">
        <h2 className="text-sm font-semibold text-text-primary">Anomalías por municipio</h2>
        <p className="mt-1 text-2xs text-text-muted">
          Cada municipio se compara contra su propia historia, no contra el promedio nacional.
        </p>
        {analysis.anomalies.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">Ningún municipio se sale de su comportamiento habitual.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {analysis.anomalies.map((anomaly) => (
              <li key={`${anomaly.municipalityText}-${anomaly.month}`} className="flex items-start gap-2">
                <AlertTriangle size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-alert" aria-hidden />
                <div>
                  <p className="text-sm text-text-primary">
                    {anomaly.municipalityText} · {anomaly.month} ·{' '}
                    <span className="font-mono">{anomaly.observed}</span> hechos
                  </p>
                  <p className="text-2xs text-text-secondary">{anomaly.explanation}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Focos geográficos" className="rounded-sm border border-border-strong bg-surface p-3">
        <h2 className="text-sm font-semibold text-text-primary">Focos geográficos</h2>
        {analysis.hotspots.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">
            No hay focos: se necesitan municipios vecinos con hechos y con geometría cargada en el catálogo.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {analysis.hotspots.map((hotspot) => (
              <li key={hotspot.clusterId} className="text-sm text-text-primary">
                {hotspot.municipalities.join(' · ')}{' '}
                <span className="font-mono text-2xs text-text-secondary">{hotspot.totalCount} hechos</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {analysis.notes.length > 0 && (
        <section
          aria-label="Límites del análisis"
          className="rounded-sm border border-border bg-surface-raised p-3 lg:col-span-2"
        >
          <h2 className="text-2xs font-semibold uppercase tracking-wide text-text-muted">Lo que no se pudo calcular</h2>
          <ul className="mt-1 list-inside list-disc text-2xs text-text-secondary">
            {analysis.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
