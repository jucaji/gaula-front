import { ArrowDown, ArrowUp, Minus } from 'lucide-react'

/** docs/06 §7.2: cifra grande, comparativo de período, tendencia -- sin gráfico si no aporta. */
export function KpiTile({
  label,
  value,
  previousValue,
  format = (n: number) => n.toLocaleString('es-CO'),
}: {
  label: string
  value: number
  previousValue?: number | undefined
  format?: (value: number) => string
}) {
  const delta = previousValue !== undefined && previousValue !== 0 ? (value - previousValue) / previousValue : undefined
  const formatted = format(value)
  // Cuántos "centésimos del ancho de la tarjeta" mide cada carácter, aproximado:
  // un número corto puede crecer mucho; uno de quince caracteres tiene que
  // conformarse con menos. `clamp` pone el piso (legible) y el techo (docs/06 §7.2).
  const fluidSize = Math.max(160 / Math.max(formatted.length, 1), 8)

  return (
    // `container-type: inline-size` es lo que habilita las unidades `cqi` de abajo:
    // sin esto la cifra escalaría con la ventana y no con su propia tarjeta.
    <div
      className="flex min-w-0 flex-col gap-1 overflow-hidden rounded-sm border border-border-strong bg-surface p-3"
      style={{ containerType: 'inline-size' }}
    >
      <p className="text-2xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      {/*
        HALLAZGO REAL (2026-09-08, midiendo a cinco anchos distintos):
        "$ 1.873.450.000" se salía de su tarjeta. El primer intento fue permitir
        el salto de línea, y resultó PEOR -- partía el número en "$ 1.873" /
        ".450.000", que se lee como otra cifra. El segundo fue una escalera de
        tamaños por longitud del texto, que tapaba unos anchos y dejaba otros
        rotos.

        Una cifra de dinero no puede cortarse NI partirse: las dos cosas mienten.
        Lo único aceptable es que se encoja, y para que encoja bien tiene que
        hacerlo en función del ancho REAL DE SU TARJETA, no del de la ventana --
        la misma tarjeta mide 343 px en un teléfono y 129 px en un escritorio con
        seis columnas. De ahí la consulta de contenedor (`cqi`): el número se
        adapta a su caja, no a la pantalla.
      */}
      <p
        className="font-semibold leading-tight text-text-primary tabular-nums whitespace-nowrap"
        style={{ fontSize: `clamp(0.9rem, ${fluidSize}cqi, 1.5rem)` }}
      >
        {formatted}
      </p>
      {delta !== undefined && (
        <p className="flex items-center gap-1 text-2xs text-text-secondary">
          {delta > 0 ? <ArrowUp size={12} /> : delta < 0 ? <ArrowDown size={12} /> : <Minus size={12} />}
          {Math.abs(delta * 100).toFixed(1)}% vs. período anterior
        </p>
      )}
    </div>
  )
}
