import type { EChartsOption } from 'echarts'
import { getCategoricalPalette, type ChartTheme } from './palette'
import { formatMeasure, rowLabel, type ExploreResult, type Presentation } from '@/lib/observatory/useExplorer'

/**
 * SPEC-0810: la gráfica del explorador, desde el resultado y la presentación.
 *
 * <p>Un solo eje de valor, siempre. «Otros» en gris neutro, nunca con un color de
 * la paleta: no es una categoría. En la torta el color sale del orden calculado
 * sin el filtro propio, así filtrar no repinta (CA-7).
 */
const NEUTRAL = { light: '#94a3b8', dark: '#64748b' }

function ink(theme: ChartTheme) {
  return theme === 'dark' ? '#e6eaed' : '#1f2933'
}

export function explorerOption(result: ExploreResult, presentation: Presentation, chartType: 'BAR_HORIZONTAL' | 'BAR_VERTICAL' | 'LINE' | 'PIE',
  theme: ChartTheme): EChartsOption {
  const palette = getCategoricalPalette(theme)
  const color = palette[presentation.colorSlot] ?? palette[0]!
  const neutral = NEUTRAL[theme]
  const rows = result.others ? [...result.rows, result.others] : result.rows
  const labels = rows.map((row) => (row.key === '__OTHERS__' ? row.label : rowLabel(row, result.dimension.kind)))
  const singular = presentation.tooltipSingular || result.measure.singular
  const plural = presentation.tooltipPlural || result.measure.plural
  const format = (value: number) => formatMeasure(value, presentation.decimals)
  const tooltipText = (label: string, value: number, partial: boolean) =>
    `${label}: <strong>${format(value)}</strong> ${value === 1 ? singular : plural}${partial ? ' <em>(periodo incompleto)</em>' : ''}`

  if (chartType === 'PIE') {
    return {
      tooltip: { trigger: 'item', formatter: (params) => {
        const item = Array.isArray(params) ? params[0]! : params
        const row = rows[item.dataIndex ?? 0]!
        return tooltipText(labels[item.dataIndex ?? 0]!, row.value, row.partial)
      } },
      legend: { bottom: 0, type: 'scroll', textStyle: { color: ink(theme) } },
      series: [{
        type: 'pie',
        radius: ['40%', '68%'],
        itemStyle: { borderWidth: 2, borderColor: 'transparent' },
        label: { show: presentation.showValueLabels, color: ink(theme), formatter: ({ value }) => format(Number(value)) },
        data: rows.map((row, index) => {
          const slot = result.colorOrder.indexOf(row.key)
          return { name: labels[index] ?? row.label, value: row.value, itemStyle: { color: (slot >= 0 ? palette[slot] : undefined) ?? neutral } }
        }),
      }],
    }
  }

  const horizontal = chartType === 'BAR_HORIZONTAL'
  // Con exactOptionalPropertyTypes, ECharts no admite propiedades en undefined: van o no van.
  const scaleBounds = presentation.scale === 'CUSTOM'
    ? { ...(presentation.scaleMin !== null ? { min: presentation.scaleMin } : {}), ...(presentation.scaleMax !== null ? { max: presentation.scaleMax } : {}) }
    : presentation.scale === 'MIN_TO_MAX' ? { min: 'dataMin' as const } : { min: 0 }
  const valueAxis = {
    type: 'value' as const,
    ...(presentation.valueAxisTitle ? { name: presentation.valueAxisTitle } : {}),
    nameLocation: 'middle' as const,
    nameGap: horizontal ? 28 : 48,
    ...scaleBounds,
    axisLabel: { formatter: (value: number) => format(value) },
  }
  const categoryAxis = {
    type: 'category' as const,
    ...(presentation.dimensionAxisTitle ? { name: presentation.dimensionAxisTitle } : {}),
    nameLocation: 'middle' as const,
    nameGap: horizontal ? 150 : 36,
    data: horizontal ? [...labels].reverse() : labels,
    axisLabel: horizontal
      ? { show: presentation.showDimensionLabels, width: 140, overflow: 'truncate' as const }
      : { show: presentation.showDimensionLabels, rotate: presentation.labelAngle, hideOverlap: true },
  }
  const ordered = horizontal ? [...rows].reverse() : rows
  const referenceLines = presentation.referenceLines.length === 0 ? {} : {
    markLine: {
      silent: true,
      symbol: 'none',
      lineStyle: { type: 'dashed' as const, color: ink(theme), width: 1 },
      label: { color: ink(theme), formatter: '{b}' },
      data: presentation.referenceLines.map((line) => (horizontal ? { xAxis: line.value, name: line.label } : { yAxis: line.value, name: line.label })),
    },
  }

  return {
    grid: { left: horizontal ? 160 : 64, right: 32, top: 24, bottom: horizontal ? 40 : 56, containLabel: false },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: horizontal ? 'shadow' : 'line' },
      formatter: (params) => {
        const item = (Array.isArray(params) ? params[0] : params)!
        const row = ordered[item.dataIndex ?? 0]!
        return tooltipText(String(item.name), row.value, row.partial)
      },
    },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series: [{
      type: chartType === 'LINE' ? 'line' : 'bar',
      color,
      barMaxWidth: horizontal ? 16 : 28,
      symbolSize: 7,
      lineStyle: { width: 2 },
      label: {
        show: presentation.showValueLabels,
        position: horizontal ? 'right' : 'top',
        color: ink(theme),
        formatter: ({ value }: { value: unknown }) => format(Number(value)),
      },
      data: ordered.map((row) => ({
        value: row.value,
        itemStyle: {
          color: row.key === '__OTHERS__' ? neutral : color,
          borderRadius: horizontal ? [0, 4, 4, 0] : chartType === 'LINE' ? 0 : [4, 4, 0, 0],
          // El periodo del corte, incompleto: rayado, para que no se lea como un periodo entero.
          ...(row.partial ? { decal: { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: -Math.PI / 4, color: 'rgba(255,255,255,0.55)' } } : {}),
        },
        ...(row.partial && chartType === 'LINE' ? { symbol: 'emptyCircle', symbolSize: 10 } : {}),
      })),
      ...referenceLines,
    }],
  }
}
