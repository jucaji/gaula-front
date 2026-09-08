import * as RadixCheckbox from '@radix-ui/react-checkbox'
import { Check, Minus } from 'lucide-react'
import clsx from 'clsx'

export interface CheckboxProps {
  checked: boolean | 'indeterminate'
  onCheckedChange: (checked: boolean) => void
  label: string
  className?: string
}

/**
 * docs/06 §7.1: `Checkbox` — siempre con `label` (accesible, aunque sea sr-only).
 *
 * <p>HALLAZGO REAL (2026-09-08, midiendo zonas táctiles): la casilla medía
 * 16×16 px, muy por debajo del objetivo de 44×44 que exige docs/06 §7 en
 * densidad cómoda.
 *
 * <p>Agrandar el CUADRO sería la solución equivocada: una casilla de 44 px se ve
 * enorme y descuadra la tabla. Lo que WCAG 2.5.8 mide es el ÁREA DE TOQUE, no el
 * dibujo, así que se separan las dos cosas: la raíz interactiva crece hasta el
 * objetivo táctil y queda transparente, y el cuadrito visible de 16 px vive
 * dentro. En escritorio con ratón `--tap-min` vale 0 y todo queda como estaba.
 */
export function Checkbox({ checked, onCheckedChange, label, className }: CheckboxProps) {
  return (
    <RadixCheckbox.Root
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      aria-label={label}
      className={clsx(
        'flex min-h-[var(--tap-min)] min-w-[var(--tap-min)] items-center justify-center rounded-xs',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        'group',
        className,
      )}
    >
      <span
        className={clsx(
          'flex h-4 w-4 items-center justify-center rounded-xs border border-border-strong bg-surface',
          'group-data-[state=checked]:border-accent group-data-[state=checked]:bg-accent',
          'group-data-[state=indeterminate]:border-accent group-data-[state=indeterminate]:bg-accent',
        )}
      >
        <RadixCheckbox.Indicator className="text-on-accent">
          {checked === 'indeterminate' ? <Minus size={11} strokeWidth={3} /> : <Check size={11} strokeWidth={3} />}
        </RadixCheckbox.Indicator>
      </span>
    </RadixCheckbox.Root>
  )
}
