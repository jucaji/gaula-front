/**
 * docs/06 §3.5 -- paleta de series validada (ΔE CVD, piso de croma, banda de
 * luminosidad, contraste contra `--viz-surface`, en ambos modos). Orden fijo,
 * nunca cíclico: un 7º valor se agrupa en "Otros" en vez de generar un hue.
 * Duplicado aquí en JS porque ECharts pinta en canvas -- no puede leer
 * `var(--viz-series-1-light)`.
 */
export const CATEGORICAL_LIGHT = ['#00997f', '#eb6834', '#2a78d6', '#eda100', '#e87ba4', '#4a3aa7'] as const
export const CATEGORICAL_DARK = ['#12a888', '#d95926', '#3987e5', '#c98500', '#d55181', '#9085e9'] as const

/** Slots 4 y 5 quedan bajo 3:1 contra la superficie en modo claro -- exigen etiqueta directa o tabla (docs/06 §3.5). */
export const LOW_CONTRAST_LIGHT_SLOTS = [3, 4] as const

export const VIZ_SURFACE_LIGHT = '#f7f8f7'
export const VIZ_SURFACE_DARK = '#14171a'

/**
 * Secuencial de un solo tono (pino) para mapas de calor -- nunca arcoíris.
 * Hex, no `oklch()`: MapLibre GL (mapa de calor, S7.FE.07) usa su propio
 * parser de color de estilo y no entiende `oklch()` -- hallazgo real,
 * "Could not parse color from value 'oklch(...)'" en consola -- así que se
 * convierten a sRGB los mismos pasos de `--color-pine-*` (primitives.css)
 * en vez de dejarlos como cadena `oklch(...)` (que sí funciona en ECharts,
 * SVG puro, pero no aquí). En modo oscuro se recalibra hacia el extremo
 * claro de la escala (mismo criterio que `--color-accent` en semantic.css,
 * que también invierte de pine-600/700 a pine-400/200 entre temas): un
 * pino casi negro sobre un fondo casi negro no se distingue.
 */
export const SEQUENTIAL_LIGHT = ['#e7f8f2', '#aee5d4', '#3eb696', '#00a07e', '#008467', '#006952', '#003b2d']

export const SEQUENTIAL_DARK = ['#aee5d4', '#3eb696', '#00a07e', '#008467', '#006952']

/**
 * Divergente para comparativos período contra período (docs/06 §3.5: "azul
 * ↔ rojo con gris en el punto medio, nunca un tono") -- reutiliza los
 * mismos tokens de estado `active`/`critical` (docs/06 §3.4) porque el
 * documento no fija un par distinto para esta escala, no porque un estado
 * reservado se use como serie categórica (sigue siendo un único par fijo,
 * nunca "serie 4").
 */
export const DIVERGING_LIGHT = { negative: '#c62828', mid: '#94a3b8', positive: '#1d4ed8' }
export const DIVERGING_DARK = { negative: '#ef5350', mid: '#64748b', positive: '#60a5fa' }

export type ChartTheme = 'light' | 'dark'

export function getCategoricalPalette(theme: ChartTheme): readonly string[] {
  return theme === 'dark' ? CATEGORICAL_DARK : CATEGORICAL_LIGHT
}

export function getSequentialPalette(theme: ChartTheme): readonly string[] {
  return theme === 'dark' ? SEQUENTIAL_DARK : SEQUENTIAL_LIGHT
}

export function getDivergingPalette(theme: ChartTheme) {
  return theme === 'dark' ? DIVERGING_DARK : DIVERGING_LIGHT
}

export function getVizSurface(theme: ChartTheme): string {
  return theme === 'dark' ? VIZ_SURFACE_DARK : VIZ_SURFACE_LIGHT
}

/**
 * Agrupa categorías más allá del sexto slot en "Otros" (docs/06 §3.5: nunca
 * un 7º hue generado) -- ordena por el valor de `sortKey` descendente y
 * suma el resto.
 */
export function foldIntoOthers<T extends { sortKey: number }>(
  items: T[],
  maxCategories: number,
  makeOther: (rest: T[]) => T,
): T[] {
  if (items.length <= maxCategories) return items
  const sorted = [...items].sort((a, b) => b.sortKey - a.sortKey)
  const kept = sorted.slice(0, maxCategories - 1)
  const rest = sorted.slice(maxCategories - 1)
  return [...kept, makeOther(rest)]
}
