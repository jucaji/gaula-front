import { useMemo } from 'react'
import { getCategoricalPalette } from '@/design-system/charts/palette'
import { useResolvedTheme } from '@/lib/theme/useResolvedTheme'
import type { MonthlyPoint } from '@/lib/observatory/types'

/**
 * SPEC-0807: la micro-serie que va dentro del ranking territorial.
 *
 * <p>Ver que Antioquia encabeza no dice si viene subiendo o bajando, y esa es la
 * pregunta que se hace en la mesa. Es un SVG a mano y no una gráfica completa:
 * una instancia de ECharts por fila para dibujar veinte píxeles de alto costaría
 * más que toda la página.
 *
 * <p>No lleva ejes ni números a propósito: es una FORMA, no una medida. El
 * número exacto está en la barra de al lado y en la tabla equivalente; una
 * micro-serie con cifras invita a leer precisión donde no la hay.
 */
export function Sparkline({ points, ariaLabel }: { points: MonthlyPoint[]; ariaLabel: string }) {
  const theme = useResolvedTheme()
  const color = getCategoricalPalette(theme)[0] ?? '#2563eb'

  const path = useMemo(() => {
    if (points.length < 2) return null
    const width = 72
    const height = 20
    const max = Math.max(...points.map((point) => point.count))
    const min = Math.min(...points.map((point) => point.count))
    const rango = max - min
    return points
      .map((point, index) => {
        const x = (index / (points.length - 1)) * width
        // Una serie CONSTANTE se dibuja por la mitad, no pegada al borde de abajo.
        // Con la escala normal, «uno todos los meses» y «cero todos los meses»
        // darían la misma raya al pie del recuadro, y son cosas distintas (visto
        // en vivo con departamentos de un hecho por mes).
        //
        // Cuando sí hay variación, la escala arranca en el mínimo de ESTA serie:
        // la micro-serie compara la categoría consigo misma a lo largo del
        // tiempo, no contra las demás.
        const y = rango === 0 ? height / 2 : height - ((point.count - min) / rango) * height
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [points])

  // Un solo mes no tiene forma. Se dice, en vez de dibujar una raya recta que
  // parecería "sin cambios".
  if (!path) {
    return <span className="text-2xs text-text-muted">sin serie</span>
  }

  return (
    <svg viewBox="0 0 72 20" width="72" height="20" role="img" aria-label={ariaLabel} className="overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
