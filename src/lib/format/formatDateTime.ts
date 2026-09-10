const DATE_TIME = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—'
  return DATE_TIME.format(new Date(iso))
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
]

const RELATIVE = new Intl.RelativeTimeFormat('es-CO', { numeric: 'auto' })

/** docs/03 §1.4: cuánto tardó en registrarse una actuación, en palabras -- no sólo un booleano `recordedLate`. */
export function formatDuration(fromIso: string, toIso: string): string {
  const seconds = (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000
  for (const [unit, unitSeconds] of UNITS) {
    if (Math.abs(seconds) >= unitSeconds) {
      return RELATIVE.format(-Math.round(seconds / unitSeconds), unit).replace(/^hace /, '')
    }
  }
  return 'menos de un minuto'
}

/**
 * "hace 12 segundos", "hace 18 minutos" -- CON el prefijo, a diferencia de
 * `formatDuration`, que lo quita a propósito porque allí la duración es una
 * columna ("5 minutos"), no una frase.
 *
 * SPEC-0506 CA-15: en la consola de flota la antigüedad de una posición ES
 * información operativa. Un comandante decide distinto ante "hace 12
 * segundos" que ante "hace 18 minutos", y la diferencia entre ambas se pierde
 * si sólo se muestra la hora absoluta.
 */
export function formatRelativeToNow(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return '—'
  const seconds = (now.getTime() - new Date(iso).getTime()) / 1000
  if (seconds < 0) return 'ahora'
  if (seconds < 10) return 'hace un momento'
  if (seconds < 60) return `hace ${Math.round(seconds)} segundos`
  for (const [unit, unitSeconds] of UNITS) {
    if (seconds >= unitSeconds) {
      return RELATIVE.format(-Math.round(seconds / unitSeconds), unit)
    }
  }
  return 'hace un momento'
}

/** La misma antigüedad a partir de segundos ya calculados por el backend. */
export function formatAgeSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—'
  if (seconds < 10) return 'hace un momento'
  if (seconds < 60) return `hace ${Math.round(seconds)} segundos`
  for (const [unit, unitSeconds] of UNITS) {
    if (seconds >= unitSeconds) {
      return RELATIVE.format(-Math.round(seconds / unitSeconds), unit)
    }
  }
  return 'hace un momento'
}

const CURRENCY_COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

export function formatCurrencyCOP(value: number): string {
  return CURRENCY_COP.format(value)
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`
}
