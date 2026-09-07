import { Circle, Square, Triangle, Octagon } from 'lucide-react'

type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'

const PRIORITY_CONFIG: Record<Priority, { label: string; Icon: typeof Circle; className: string }> = {
  LOW: { label: 'Baja', Icon: Circle, className: 'text-neutral' },
  NORMAL: { label: 'Normal', Icon: Square, className: 'text-active' },
  HIGH: { label: 'Alta', Icon: Triangle, className: 'text-alert' },
  CRITICAL: { label: 'Crítica', Icon: Octagon, className: 'text-critical' },
}

/**
 * docs/06 §7.2: "cuatro niveles con forma distinta, no sólo color" -- un
 * operador con daltonismo tiene que distinguir la prioridad por la FORMA
 * del ícono, el color es refuerzo, nunca la única señal.
 */
export function PriorityIndicator({ priority }: { priority: string }) {
  const config = PRIORITY_CONFIG[priority as Priority] ?? { label: priority, Icon: Circle, className: 'text-neutral' }
  const { label, Icon, className } = config

  return (
    <span className={'inline-flex items-center gap-1.5 text-xs font-medium ' + className}>
      <Icon size={12} strokeWidth={2} fill="currentColor" />
      {label}
    </span>
  )
}
