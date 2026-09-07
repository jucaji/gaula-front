import { Rows2, Rows3, Rows4 } from 'lucide-react'
import { useDensityStore, type DensityPreference } from '@/design-system/tokens/density'

const OPTIONS: { value: DensityPreference; label: string; Icon: typeof Rows2 }[] = [
  { value: 'compact', label: 'Compacta', Icon: Rows4 },
  { value: 'default', label: 'Default', Icon: Rows3 },
  { value: 'comfortable', label: 'Cómoda', Icon: Rows2 },
]

/** docs/06 §5: tres densidades, elegibles por el usuario -- mismo patrón visual que ThemeToggle. */
export function DensityToggle() {
  const density = useDensityStore((state) => state.density)
  const setDensity = useDensityStore((state) => state.setDensity)

  return (
    <div className="flex items-center gap-1 rounded-sm border border-border p-0.5" role="radiogroup" aria-label="Densidad">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={density === value}
          title={label}
          onClick={() => setDensity(value)}
          className={
            'flex h-7 w-7 items-center justify-center rounded-xs transition-colors duration-instant ' +
            (density === value ? 'bg-accent-subtle text-accent-hover' : 'text-text-muted hover:text-text-primary')
          }
        >
          <Icon size={16} strokeWidth={1.5} />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  )
}
