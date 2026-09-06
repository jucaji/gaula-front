import { Circle, CircleAlert, CircleCheck, CircleDot, CircleX } from 'lucide-react'

type OperationalState = 'active' | 'alert' | 'stable' | 'neutral'

const STATUS_CONFIG: Record<string, { label: string; state: OperationalState }> = {
  RECEIVED: { label: 'Recibido', state: 'active' },
  UNDER_VERIFICATION: { label: 'En verificación', state: 'alert' },
  IN_OPERATION: { label: 'En operación', state: 'active' },
  RESULT_RECORDED: { label: 'Resultado registrado', state: 'stable' },
  PROSECUTED: { label: 'Judicializado', state: 'stable' },
  CLOSED: { label: 'Cerrado', state: 'neutral' },
  CLOSED_WITHOUT_MERIT: { label: 'Cerrado sin mérito', state: 'neutral' },
}

const STATE_STYLE: Record<OperationalState, { icon: typeof Circle; className: string }> = {
  active: { icon: CircleDot, className: 'text-active' },
  alert: { icon: CircleAlert, className: 'text-alert' },
  stable: { icon: CircleCheck, className: 'text-stable' },
  neutral: { icon: CircleX, className: 'text-neutral' },
}

/**
 * docs/06 §7.2, §3.4: punto de color + etiqueta + icono -- NUNCA color a
 * solas. Un operador con daltonismo, en una pantalla mal calibrada, a las
 * 3 de la mañana, tiene que poder leerlo igual.
 */
export function CaseStatusChip({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, state: 'neutral' as const }
  const { icon: Icon, className } = STATE_STYLE[config.state]

  return (
    <span className={'inline-flex items-center gap-1.5 text-xs font-medium ' + className}>
      <Icon size={14} strokeWidth={1.5} />
      {config.label}
    </span>
  )
}
