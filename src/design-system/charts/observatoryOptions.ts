import type { EChartsOption } from 'echarts'
import { CATEGORICAL_LIGHT, getCategoricalPalette, getSequentialPalette, type ChartTheme } from './palette'
import {
  KIDNAPPING_TYPE_LABEL,
  MODALITY_LABEL,
  VICTIM_STATUS_LABEL,
  type Breakdown,
  type MonthlyPoint,
  type YearlyPoint,
} from '@/lib/observatory/types'

const MONTH_LABEL = new Intl.DateTimeFormat('es-CO', { month: 'short', year: '2-digit' })

/**
 * SPEC-0807 CA-5: las opciones de gráfica viven en UN sitio.
 *
 * <p>El modo lámina muestra las mismas cifras que el tablero, en grande. Si cada
 * pantalla armara su propia gráfica, la lámina que se proyecta en la mesa podría
 * terminar diciendo algo distinto de la pantalla desde la que se preparó — y
 * nadie lo notaría hasta estar frente al comando.
 */
export function labelFor(dimension: string, key: string): string {
  if (dimension === 'modality') return MODALITY_LABEL[key as keyof typeof MODALITY_LABEL] ?? key
  if (dimension === 'victimStatus') return VICTIM_STATUS_LABEL[key as keyof typeof VICTIM_STATUS_LABEL] ?? key
  if (dimension === 'kidnappingType') return KIDNAPPING_TYPE_LABEL[key as keyof typeof KIDNAPPING_TYPE_LABEL] ?? key
  return key
}

export function shareOf(rows: Breakdown[], row: Breakdown): string {
  const total = rows.reduce((sum, item) => sum + item.count, 0)
  return total === 0 ? '—' : `${((row.count / total) * 100).toFixed(1)} %`
}

/**
 * `scale` agranda ejes y símbolos para la proyección. En la mesa de seguimiento
 * la lámina se ve a varios metros: la densidad que sirve en un escritorio no se
 * lee en esa sala.
 */
export interface OptionContext {
  theme: ChartTheme
  scale?: number
}

function slots(theme: ChartTheme) {
  const categorical = getCategoricalPalette(theme)
  // El respaldo es el slot 0 de la MISMA paleta, nunca un hex inventado: sería un
  // color fuera de la escala validada (docs/06 §3.5).
  return (index: number) => categorical[index] ?? CATEGORICAL_LIGHT[0]
}

function textStyle(scale: number) {
  return { fontSize: 12 * scale }
}

export function monthlyOption(points: MonthlyPoint[], { theme, scale = 1 }: OptionContext): EChartsOption {
  return {
    color: [slots(theme)(0)],
    grid: { left: 48 * scale, right: 16, top: 24, bottom: 32 * scale },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      axisLabel: textStyle(scale),
      data: points.map((point) => MONTH_LABEL.format(new Date(`${point.month}T00:00:00`))),
    },
    yAxis: { type: 'value', minInterval: 1, axisLabel: textStyle(scale) },
    series: [
      {
        type: 'line',
        smooth: false,
        symbolSize: 8 * scale,
        lineStyle: { width: 2 * scale },
        data: points.map((point) => point.count),
      },
    ],
  }
}

export function yearlyOption(points: YearlyPoint[], { theme, scale = 1 }: OptionContext): EChartsOption {
  return {
    color: [slots(theme)(1)],
    grid: { left: 48 * scale, right: 16, top: 24, bottom: 32 * scale },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', axisLabel: textStyle(scale), data: points.map((point) => String(point.year)) },
    yAxis: { type: 'value', minInterval: 1, axisLabel: textStyle(scale) },
    series: [
      {
        type: 'bar',
        barMaxWidth: 28 * scale,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        data: points.map((point) => point.count),
      },
    ],
  }
}

export function barOption(rows: Breakdown[], dimension: string, { theme, scale = 1 }: OptionContext): EChartsOption {
  return {
    color: [slots(theme)(2)],
    grid: { left: 140 * scale, right: 24, top: 16, bottom: 32 * scale },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'value', minInterval: 1, axisLabel: textStyle(scale) },
    yAxis: {
      type: 'category',
      axisLabel: textStyle(scale),
      data: [...rows].reverse().map((row) => labelFor(dimension, row.key)),
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 18 * scale,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        data: [...rows].reverse().map((row) => row.count),
      },
    ],
  }
}

export function donutOption(rows: Breakdown[], dimension: string, { theme, scale = 1 }: OptionContext): EChartsOption {
  return {
    color: [...getSequentialPalette(theme)],
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, type: 'scroll', textStyle: textStyle(scale) },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        itemStyle: { borderWidth: 2, borderColor: 'transparent' },
        label: { show: false },
        data: rows.map((row) => ({ name: labelFor(dimension, row.key), value: row.count })),
      },
    ],
  }
}
