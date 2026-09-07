import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import { useResolvedTheme } from '@/lib/theme/useResolvedTheme'
import { getVizSurface } from './palette'

/**
 * Envoltorio mínimo de ECharts -- no hay `echarts-for-react` en el
 * proyecto y no se justifica una dependencia nueva para esto. Recrea la
 * instancia al cambiar de tema (ECharts no permite cambiar `theme` en
 * caliente sin `dispose()`) y sólo actualiza `option` en los demás casos.
 */
export function EchartsChart({
  option,
  height = 320,
  ariaLabel,
}: {
  option: echarts.EChartsOption
  height?: number
  ariaLabel: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const theme = useResolvedTheme()

  useEffect(() => {
    if (!containerRef.current) return
    const chart = echarts.init(containerRef.current, undefined, { renderer: 'svg' })
    chart.setOption({ backgroundColor: getVizSurface(theme), ...option })
    chartRef.current = chart

    const resizeObserver = new ResizeObserver(() => chart.resize())
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      chart.dispose()
      chartRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recrear sólo al cambiar de tema; `option` se aplica en el efecto de abajo
  }, [theme])

  useEffect(() => {
    chartRef.current?.setOption({ backgroundColor: getVizSurface(theme), ...option }, { notMerge: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `theme` ya dispara la recreación de arriba
  }, [option])

  return <div ref={containerRef} role="img" aria-label={ariaLabel} style={{ width: '100%', height }} />
}
