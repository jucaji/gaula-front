import { Loader2 } from 'lucide-react'
import clsx from 'clsx'

export interface SpinnerProps {
  size?: number
  className?: string
  label?: string
}

/** docs/06 §7.1: `Spinner` -- gira, nunca decora sola: siempre acompañado de un `label` para lectores de pantalla. */
export function Spinner({ size = 20, className, label = 'Cargando' }: SpinnerProps) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <Loader2 size={size} strokeWidth={2} className={clsx('animate-spin text-text-muted', className)} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  )
}
