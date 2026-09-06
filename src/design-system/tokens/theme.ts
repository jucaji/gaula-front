/**
 * Resolvedor de tema (docs/06 §3.6): tres estados — claro explícito, oscuro
 * explícito, seguir al sistema. El destello anti-flash real ocurre en el
 * `<script>` bloqueante de index.html; esto sólo mantiene el estado en
 * sincronía después de la hidratación (cambios desde el selector de la UI).
 */
export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'gaula-theme'

export function getStoredThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* localStorage inaccesible -- se sigue el sistema */
  }
  return 'system'
}

export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement
  if (preference === 'system') {
    root.removeAttribute('data-theme')
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* no-op */
    }
    return
  }
  root.setAttribute('data-theme', preference)
  try {
    localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    /* no-op: la preferencia sólo dura esta sesión */
  }
}

export function resolveEffectiveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
