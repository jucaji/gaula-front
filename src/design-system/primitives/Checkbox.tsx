import * as RadixCheckbox from '@radix-ui/react-checkbox'
import { Check, Minus } from 'lucide-react'
import clsx from 'clsx'

export interface CheckboxProps {
  checked: boolean | 'indeterminate'
  onCheckedChange: (checked: boolean) => void
  label: string
  className?: string
}

/** docs/06 §7.1: `Checkbox` -- siempre con `label` (accesible, aunque sea sr-only). */
export function Checkbox({ checked, onCheckedChange, label, className }: CheckboxProps) {
  return (
    <RadixCheckbox.Root
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      aria-label={label}
      className={clsx(
        'flex h-4 w-4 items-center justify-center rounded-xs border border-border-strong bg-surface',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
        'data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        className,
      )}
    >
      <RadixCheckbox.Indicator className="text-on-accent">
        {checked === 'indeterminate' ? <Minus size={11} strokeWidth={3} /> : <Check size={11} strokeWidth={3} />}
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  )
}
