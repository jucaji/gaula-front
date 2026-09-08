import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import clsx from 'clsx'

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

  return (
    <div className="flex flex-col gap-1 rounded-sm border border-border-strong bg-surface p-3">
      <p className="text-2xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      {/*
        HALLAZGO REAL (2026-09-08, con datos reales en el tablero): con seis
        tarjetas en una rejilla estrecha, "$ 73.000.000" se cortaba a "$ 73.0…".

        Una cifra de dinero NO puede cortarse ni partirse en dos renglones: las
        dos cosas se leen como otra cifra ("$ 73.0" / "00.000"). Lo único
        aceptable es que se encoja, así que el tamaño depende de cuánto ocupa el
        número formateado y el salto de línea queda prohibido.
      */}
      <p
        className={clsx(
          'font-semibold leading-tight text-text-primary tabular-nums whitespace-nowrap',
          formatted.length > 9 ? 'text-base lg:text-xl' : 'text-2xl',
        )}
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
