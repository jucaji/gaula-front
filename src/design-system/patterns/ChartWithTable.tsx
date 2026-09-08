import { useState, type ReactNode } from 'react'

/**
 * S7.FE.05 (docs/06 §3.5): "vista de tabla alternativa en toda gráfica" --
 * obligatoria, no un adorno: los slots 4 y 5 de la paleta caen bajo 3:1 de
 * contraste en modo claro, y esta es la salida exigida cuando el color
 * solo no basta.
 */
export function ChartWithTable<TRow>({
  title,
  chart,
  rows,
  columns,
  getRowKey,
  actions,
}: {
  title: string
  chart: ReactNode
  rows: TRow[]
  columns: { header: string; cell: (row: TRow) => ReactNode }[]
  getRowKey: (row: TRow, index: number) => string
  actions?: ReactNode
}) {
  const [showTable, setShowTable] = useState(false)

  return (
    // `section` con nombre accesible: cada gráfica es una región navegable por
    // lector de pantalla, no un `div` anónimo más dentro de una rejilla de ocho.
    <section aria-label={title} className="rounded-sm border border-border-strong bg-surface p-3">
      <div className="flex items-center justify-between">
        {/*
          HALLAZGO REAL (axe-core, S14.FE.05): era un `h3` bajo el `h1` de la
          página, saltándose el nivel 2 -- `heading-order`. Afectaba también a
          /analitica desde el Sprint 7 y nadie lo vio porque el escaneo de humo
          sólo cubre `/`. Para quien navega por encabezados, un salto de nivel es
          una sección que parece colgar de otra que no existe.
        */}
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <div className="flex items-center gap-3">
          {actions}
          <button
            type="button"
            onClick={() => setShowTable((value) => !value)}
            className="text-2xs font-medium text-accent hover:text-accent-hover"
          >
            {showTable ? 'Ver gráfica' : 'Ver tabla'}
          </button>
        </div>
      </div>

      <div className="mt-2">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-secondary">Sin datos en el rango y los filtros seleccionados.</p>
        ) : showTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-2xs uppercase text-text-muted">
                  {columns.map((column) => (
                    <th key={column.header} className="py-1 pr-3 font-medium">
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={getRowKey(row, index)} className="border-b border-border">
                    {columns.map((column) => (
                      <td key={column.header} className="py-1 pr-3 text-text-primary">
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          chart
        )}
      </div>
    </section>
  )
}
