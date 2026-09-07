import { create } from 'zustand'

/**
 * Resolvedor de densidad (docs/06 §5): tres densidades, "elegibles por el
 * usuario y persistidas en su perfil". Sin un endpoint de perfil todavía
 * (INSUMO PENDIENTE, igual que la sesión en session.ts antes de
 * `/api/v1/me`), se persiste en `localStorage` como string plano -- el
 * mismo formato que lee el script anti-destello de index.html, así que
 * NO se usa el middleware `persist` de Zustand (envuelve el valor en
 * JSON, rompería ese script). Zustand aquí es sólo el estado UI
 * compartido (docs/01 §4): `DataTable` necesita el alto de fila como
 * NÚMERO en JS para el virtualizador, no sólo como variable CSS.
 */
export type DensityPreference = 'compact' | 'default' | 'comfortable'

const STORAGE_KEY = 'gaula-density'

export const DENSITY_ROW_HEIGHT: Record<DensityPreference, number> = {
  compact: 32,
  default: 36,
  comfortable: 44,
}

export function getStoredDensityPreference(): DensityPreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'compact' || stored === 'default' || stored === 'comfortable') return stored
  } catch {
    /* localStorage inaccesible -- se usa el default */
  }
  return 'default'
}

interface DensityStore {
  density: DensityPreference
  setDensity: (preference: DensityPreference) => void
}

export const useDensityStore = create<DensityStore>((set) => ({
  density: getStoredDensityPreference(),
  setDensity: (preference) => {
    document.documentElement.setAttribute('data-density', preference)
    try {
      localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      /* no-op: la preferencia sólo dura esta sesión */
    }
    set({ density: preference })
  },
}))
