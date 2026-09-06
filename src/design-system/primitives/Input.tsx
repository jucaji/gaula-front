import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import clsx from 'clsx'

export type InputSize = 'sm' | 'md' | 'lg' | 'touch'

const SIZE_CLASSES: Record<InputSize, string> = {
  sm: 'h-[var(--control-height-sm)] px-2 text-xs',
  md: 'h-[var(--control-height-md)] px-2.5 text-sm',
  lg: 'h-[var(--control-height-lg)] px-3 text-base',
  touch: 'h-[var(--control-height-touch)] px-3 text-base',
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: InputSize
  /** Marca el campo como inválido -- el mensaje real lo pinta el `field error` que acompaña (docs/07 §5). */
  invalid?: boolean
}

/** docs/06 §7.1: `Input`. Borde 1px, radio 4px, foco visible, estado inválido sin depender sólo del color. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', invalid = false, disabled, className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={clsx(
        'w-full rounded-sm border bg-surface text-text-primary placeholder:text-text-muted',
        'transition-colors duration-instant ease-out',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-muted',
        invalid ? 'border-critical' : 'border-border-strong',
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  )
})
