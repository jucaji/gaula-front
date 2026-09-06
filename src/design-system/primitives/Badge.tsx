import type { HTMLAttributes } from 'react'
import clsx from 'clsx'

export type BadgeTone = 'neutral' | 'accent' | 'critical' | 'alert' | 'active' | 'stable'

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-text-secondary',
  accent: 'bg-accent-subtle text-accent-hover',
  critical: 'bg-surface-sunken text-critical',
  alert: 'bg-surface-sunken text-alert',
  active: 'bg-surface-sunken text-active',
  stable: 'bg-surface-sunken text-stable',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
}

/**
 * docs/06 §7.1: `Badge` -- etiqueta genérica, siempre con texto (nunca sólo
 * color ni sólo icono). Para estado de caso usar `CaseStatusChip`
 * (docs/06 §7.2), que además exige punto + icono por ser un estado
 * operativo reservado.
 */
export function Badge({ tone = 'neutral', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-2xs font-medium leading-none',
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
