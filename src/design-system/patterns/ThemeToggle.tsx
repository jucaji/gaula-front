import { useEffect, useState } from 'react'
import { Moon, Sun, SunMoon } from 'lucide-react'
import { applyThemePreference, getStoredThemePreference, type ThemePreference } from '@/design-system/tokens/theme'

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
  { value: 'system', label: 'Sistema', Icon: SunMoon },
]

/** docs/06 §3.6: tres estados -- claro explícito, oscuro explícito, seguir al sistema. */
export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>(() => getStoredThemePreference())

  useEffect(() => {
    applyThemePreference(preference)
  }, [preference])

  return (
    <div className="flex items-center gap-1 rounded-sm border border-border p-0.5" role="radiogroup" aria-label="Tema">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          title={label}
          onClick={() => setPreference(value)}
          className={
            'flex h-7 w-7 min-h-[var(--tap-min)] min-w-[var(--tap-min)] items-center justify-center rounded-xs transition-colors duration-instant ' +
            (preference === value
              ? 'bg-accent-subtle text-accent-hover'
              : 'text-text-muted hover:text-text-primary')
          }
        >
          <Icon size={16} strokeWidth={1.5} />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  )
}
