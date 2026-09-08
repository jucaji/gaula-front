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
  return defaultDensityForDevice()
}

/**
 * HALLAZGO REAL (2026-09-08, midiendo zonas táctiles): docs/06 §7 garantiza
 * objetivos de 44x44 px **en densidad `comfortable`**, pero la densidad por
 * defecto era `default` para todo el mundo -- también para un dedo. En un
 * teléfono, los controles quedaban en 28 y 34 px.
 *
 * <p>La densidad se decide por el DISPOSITIVO DE ENTRADA, no por el ancho de la
 * pantalla: lo que exige un objetivo grande es el dedo, no el tamaño del
 * monitor. Una tableta de 1024 px con pantalla táctil necesita `comfortable`
 * tanto como un teléfono de 375; un portátil pequeño con ratón, no.
 *
 * <p>Sigue siendo sólo el valor INICIAL: en cuanto el usuario elige, su elección
 * manda y se persiste (docs/06 §5, "elegibles por el usuario").
 */
function defaultDensityForDevice(): DensityPreference {
  try {
    if (window.matchMedia('(pointer: coarse)').matches) return 'comfortable'
  } catch {
    /* sin matchMedia (pruebas de nodo, renderizado en servidor) */
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
