import { useMemo } from 'react'
import { getSequentialPalette } from '@/design-system/charts/palette'
import { useResolvedTheme } from '@/lib/theme/useResolvedTheme'
import type { MonthlyPoint } from '@/lib/observatory/types'

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MONTH_NAME = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' })

interface Cell {
  year: number
  month: number
  /** `null` = el corte no cubre ese mes. NO es lo mismo que cero hechos. */
  count: number | null
}

/**
 * SPEC-0807: el calendario mes × año.
 *
 * <p>La serie de líneas responde «cuánto» y esconde «cuándo dentro del año». Una
 * cuadrícula pone los doce meses de cada año uno debajo de otro, y la
 * estacionalidad —si existe— se ve sin que nadie la busque.
 *
 * <p>La regla que gobierna este componente: un mes SIN HECHOS y un mes que el
 * corte NO CUBRE no se pintan igual. El primero es un cero, una afirmación sobre
 * la realidad; el segundo es ausencia de dato. Pintarlos igual es la forma más
 * fácil de hacer que un tablero mienta sin que nadie pueda notarlo.
 */
export function MonthlyCalendar({ points, from, to }: { points: MonthlyPoint[]; from?: string | undefined; to?: string | undefined }) {
  const theme = useResolvedTheme()
  const sequential = getSequentialPalette(theme)

  const { cells, years, max } = useMemo(() => build(points, from, to), [points, from, to])

  if (years.length === 0) {
    return null
  }

  const colorFor = (count: number | null) => {
    if (count === null) return 'transparent'
    if (count === 0) return sequential[0] ?? 'transparent'
    // Cuatro pasos sobre el máximo observado: la escala se lee de un vistazo y
    // no depende de un umbral inventado.
    const step = Math.min(sequential.length - 1, 1 + Math.floor(((count - 1) / Math.max(max, 1)) * (sequential.length - 2)))
    return sequential[step] ?? sequential[sequential.length - 1]
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-separate border-spacing-1 text-2xs">
        <caption className="sr-only">Hechos por mes y año</caption>
        <thead>
          <tr>
            <th scope="col" className="w-10 text-left font-normal text-text-muted">
              <span className="sr-only">Año</span>
            </th>
            {MONTHS.map((month) => (
              <th key={month} scope="col" className="font-normal text-text-muted">
                {month}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map((year) => (
            <tr key={year}>
              <th scope="row" className="text-left font-medium text-text-secondary">
                {year}
              </th>
              {MONTHS.map((_, monthIndex) => {
                const cell = cells.get(`${year}-${monthIndex}`)
                const count = cell?.count ?? null
                const etiqueta =
                  count === null
                    ? `${MONTH_NAME.format(new Date(year, monthIndex, 1))}: fuera del período consultado`
                    : `${MONTH_NAME.format(new Date(year, monthIndex, 1))}: ${count} ${count === 1 ? 'hecho' : 'hechos'}`
                return (
                  <td key={monthIndex} className="p-0">
                    <div
                      title={etiqueta}
                      aria-label={etiqueta}
                      className={`h-6 w-full rounded-[2px] ${
                        count === null
                          ? // Rayado, no gris: un gris plano se confunde con "pocos hechos".
                            'border border-dashed border-border-strong'
                          : 'border border-border'
                      }`}
                      style={count === null ? undefined : { backgroundColor: colorFor(count) }}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-text-secondary">
        <span className="flex items-center gap-1">
          menos
          {sequential.map((color) => (
            <span key={color} aria-hidden className="inline-block size-2.5 rounded-[2px]" style={{ backgroundColor: color }} />
          ))}
          más
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2.5 rounded-[2px]" style={{ backgroundColor: sequential[0] }} />
          Cero hechos
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2.5 rounded-[2px] border border-dashed border-border-strong" />
          Fuera del período consultado
        </span>
      </div>
    </div>
  )
}

/**
 * El corte agrupa: los meses sin hechos NO vienen en la serie. Para saber si un
 * mes vacío es un cero o una ausencia hay que reconstruir el período: los
 * filtros de fecha si los hay, y si no, del primer al último mes con dato.
 */
function build(points: MonthlyPoint[], from?: string, to?: string) {
  const cells = new Map<string, Cell>()
  if (points.length === 0) return { cells, years: [] as number[], max: 0 }

  const meses = points.map((point) => new Date(`${point.month}T00:00:00`))
  const inicio = from ? new Date(`${from.slice(0, 7)}-01T00:00:00`) : new Date(Math.min(...meses.map((d) => d.getTime())))
  const fin = to ? new Date(`${to.slice(0, 7)}-01T00:00:00`) : new Date(Math.max(...meses.map((d) => d.getTime())))

  const porMes = new Map(points.map((point) => [point.month.slice(0, 7), point.count]))
  const cursor = new Date(inicio)
  while (cursor <= fin) {
    const clave = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
    cells.set(`${cursor.getFullYear()}-${cursor.getMonth()}`, {
      year: cursor.getFullYear(),
      month: cursor.getMonth(),
      count: porMes.get(clave) ?? 0,
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  const years = [...new Set([...cells.values()].map((cell) => cell.year))].sort((a, b) => a - b)
  const max = Math.max(...points.map((point) => point.count))
  return { cells, years, max }
}
