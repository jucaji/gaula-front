import type { EChartsOption } from 'echarts'
import { getCategoricalPalette, type ChartTheme } from './palette'
import { MONTHS, formatShortDay, type MonthValue, type SheetTerritory, type YearValue } from '@/lib/observatory/useCrimeSheet'

/**
 * SPEC-0809: las cuatro gráficas de la ficha, en un solo sitio.
 *
 * <p>Colores por lo que representan, fijos: el año anterior y el año de corte
 * siempre con el mismo par, la serie histórica con otro. Nunca dos ejes.
 */
/** Separador de miles en español en los ejes, igual que en las etiquetas: «12.000», no «12,000». */
const AXIS_TEXT = { fontSize: 11 }
const VALUE_AXIS_TEXT = { fontSize: 11, formatter: (value: number) => value.toLocaleString('es-CO') }

/** ECharts pinta la leyenda en #333 por defecto: invisible sobre la superficie oscura. */
function legendText(theme: ChartTheme) {
  return { color: theme === 'dark' ? '#e6eaed' : '#1f2933' }
}

function colors(theme: ChartTheme) {
  const palette = getCategoricalPalette(theme)
  return { previous: palette[0]!, current: palette[1]!, series: palette[2]! }
}

/** Texto y reglas de las notas: tono de tinta secundaria, nunca un color de serie. */
function noteColor(theme: ChartTheme) {
  return theme === 'dark' ? '#c9d1d6' : '#5b6770'
}

function methodologyLines(notes: { effectiveOn: string }[], years: number[], theme: ChartTheme) {
  const data = notes
    .map((note) => Number(note.effectiveOn.slice(0, 4)))
    .filter((year) => years.includes(year))
    .map((year) => ({ xAxis: String(year), label: { formatter: `cambio de registro ${year}` } }))
  if (data.length === 0) return undefined
  return {
    silent: true,
    symbol: 'none',
    lineStyle: { type: 'dashed' as const, color: noteColor(theme), width: 1 },
    // Horizontal, arriba de la línea: vertical quedaba encima de los puntos de la serie.
    label: { position: 'end' as const, rotate: 0, color: noteColor(theme), fontSize: 10 },
    data,
  }
}

/** Con `exactOptionalPropertyTypes`, ECharts no admite `markLine: undefined`: la propiedad va o no va. */
function markLineOf(notes: { effectiveOn: string }[], years: number[], theme: ChartTheme) {
  const markLine = methodologyLines(notes, years, theme)
  return markLine ? { markLine } : {}
}

export function historyOption(points: YearValue[], notes: { effectiveOn: string }[], theme: ChartTheme): EChartsOption {
  const { series } = colors(theme)
  const lastIndex = points.findLastIndex((point) => point.victims !== null)
  return {
    grid: { left: 56, right: 24, top: 36, bottom: 28 },
    tooltip: { trigger: 'axis', valueFormatter: (value) => (value == null ? 'sin dato' : `${Number(value).toLocaleString('es-CO')} víctimas`) },
    xAxis: { type: 'category', axisLabel: AXIS_TEXT, data: points.map((point) => String(point.year)) },
    yAxis: { type: 'value', minInterval: 1, axisLabel: VALUE_AXIS_TEXT },
    series: [
      {
        name: 'Víctimas',
        type: 'line',
        color: series,
        symbolSize: 8,
        lineStyle: { width: 2 },
        // Etiqueta sólo en el último punto: una cifra en cada punto es ruido.
        data: points.map((point, index) => ({
          value: point.victims,
          label: { show: index === lastIndex, position: 'top', fontWeight: 'bold', formatter: ({ value }: { value: unknown }) => Number(value).toLocaleString('es-CO') },
        })),
        ...markLineOf(notes, points.map((point) => point.year), theme),
      },
    ],
  }
}

export function yearToDateOption(points: YearValue[], cutoffDate: string, notes: { effectiveOn: string }[],
  theme: ChartTheme): EChartsOption {
  const { series, current } = colors(theme)
  const window = `1 ene – ${formatShortDay(cutoffDate)}`
  return {
    grid: { left: 56, right: 24, top: 36, bottom: 28 },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value) => (value == null ? 'sin dato' : `${Number(value).toLocaleString('es-CO')} víctimas (${window})`),
    },
    xAxis: { type: 'category', axisLabel: AXIS_TEXT, data: points.map((point) => String(point.year)) },
    yAxis: { type: 'value', minInterval: 1, axisLabel: VALUE_AXIS_TEXT },
    series: [
      {
        name: 'Víctimas',
        type: 'bar',
        barMaxWidth: 28,
        data: points.map((point, index) => {
          const last = index === points.length - 1
          return {
            value: point.victims,
            itemStyle: { color: last ? current : series, borderRadius: [4, 4, 0, 0] },
            label: { show: last, position: 'top', fontWeight: 'bold', formatter: ({ value }: { value: unknown }) => Number(value).toLocaleString('es-CO') },
          }
        }),
        ...markLineOf(notes, points.map((point) => point.year), theme),
      },
    ],
  }
}

export function monthlyOption(months: MonthValue[], previousYear: number, currentYear: number, cutoffDate: string,
  theme: ChartTheme): EChartsOption {
  const { previous, current } = colors(theme)
  const partialLabel = `parcial al ${formatShortDay(cutoffDate)}`
  return {
    grid: { left: 56, right: 16, top: 36, bottom: 28 },
    legend: { top: 0, data: [String(previousYear), String(currentYear)], textStyle: legendText(theme) },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const items = Array.isArray(params) ? params : [params]
        const month = months[items[0]?.dataIndex ?? 0]
        const lines = items.map((item) => {
          const value = item.value as number | null | undefined
          const text = value == null ? 'todavía no hay dato' : `${value.toLocaleString('es-CO')} víctimas`
          return `${item.marker ?? ''} ${item.seriesName}: ${text}`
        })
        if (month?.partial) lines.push(`<em>${currentYear}: ${partialLabel}</em>`)
        return [`<strong>${MONTHS[(month?.month ?? 1) - 1]}</strong>`, ...lines].join('<br/>')
      },
    },
    xAxis: { type: 'category', axisLabel: AXIS_TEXT, data: MONTHS },
    yAxis: { type: 'value', minInterval: 1, axisLabel: VALUE_AXIS_TEXT },
    series: [
      {
        name: String(previousYear),
        type: 'bar',
        color: previous,
        barMaxWidth: 16,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        data: months.map((month) => month.previous),
      },
      {
        name: String(currentYear),
        type: 'bar',
        color: current,
        barMaxWidth: 16,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        // Un mes que no ha pasado viaja como null y no se dibuja: no es cero.
        data: months.map((month) =>
          month.partial
            ? {
                value: month.current,
                itemStyle: {
                  borderRadius: [4, 4, 0, 0],
                  decal: { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: -Math.PI / 4, color: 'rgba(255,255,255,0.55)' },
                },
                label: { show: true, position: 'top', fontSize: 10, formatter: 'parcial' },
              }
            : month.current,
        ),
      },
    ],
  }
}

/** Horizontales: 33 nombres de departamento no caben girados bajo una barra vertical. */
export function territoryOption(territories: SheetTerritory[], theme: ChartTheme): EChartsOption {
  const { series } = colors(theme)
  const ordered = [...territories].reverse()
  return {
    grid: { left: 150, right: 56, top: 8, bottom: 24 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value) => `${Number(value).toLocaleString('es-CO')} víctimas` },
    xAxis: { type: 'value', minInterval: 1, axisLabel: VALUE_AXIS_TEXT },
    yAxis: { type: 'category', axisLabel: { ...AXIS_TEXT, width: 140, overflow: 'truncate' }, data: ordered.map((territory) => territory.name) },
    series: [
      {
        name: 'Víctimas',
        type: 'bar',
        color: series,
        barMaxWidth: 14,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', fontSize: 10, formatter: ({ value }) => Number(value).toLocaleString('es-CO') },
        data: ordered.map((territory) => territory.victims),
      },
    ],
  }
}
