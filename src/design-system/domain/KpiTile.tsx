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

  return (
    <div className="flex flex-col gap-1 rounded-sm border border-border-strong bg-surface p-3">
      <p className="text-2xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className="text-2xl font-semibold text-text-primary">{format(value)}</p>
      {delta !== undefined && (
        <p className="flex items-center gap-1 text-2xs text-text-secondary">
          {delta > 0 ? <ArrowUp size={12} /> : delta < 0 ? <ArrowDown size={12} /> : <Minus size={12} />}
          {Math.abs(delta * 100).toFixed(1)}% vs. período anterior
        </p>
      )}
    </div>
  )
}
