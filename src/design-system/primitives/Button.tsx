import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { Loader2 } from 'lucide-react'
import clsx from 'clsx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'touch'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'border border-border-strong bg-surface text-text-primary hover:bg-surface-sunken',
  ghost: 'text-text-primary hover:bg-surface-sunken',
  danger: 'bg-danger text-on-danger hover:bg-danger-hover',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-[var(--control-height-sm)] gap-1.5 px-2 text-xs',
  md: 'h-[var(--control-height-md)] gap-1.5 px-3 text-sm',
  lg: 'h-[var(--control-height-lg)] gap-2 px-4 text-base',
  touch: 'h-[var(--control-height-touch)] gap-2 px-4 text-base',
}

const ICON_SIZE: Record<ButtonSize, number> = {
  sm: 14,
  md: 16,
  lg: 18,
  touch: 18,
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  /** Delega el render al hijo (p. ej. un `<Link>` de TanStack Router) -- docs/06 §7.1. */
  asChild?: boolean
  children?: ReactNode
}

/**
 * docs/06 §7.1: `Button` (primary · secondary · ghost · danger, 4 tamaños,
 * con estado de carga). Radio 4px (`rounded-sm`, el máximo para controles
 * per §5), sin sombra difusa, transición <=200ms sólo en color.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, asChild = false, disabled, className, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex items-center justify-center whitespace-nowrap rounded-sm font-medium',
        'transition-colors duration-instant ease-out',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {asChild ? (
        // Radix Slot exige exactamente un elemento hijo -- no se le puede
        // agregar el spinner como hermano cuando asChild está activo.
        children
      ) : (
        <>
          {loading && <Loader2 size={ICON_SIZE[size]} strokeWidth={2} className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  )
})
