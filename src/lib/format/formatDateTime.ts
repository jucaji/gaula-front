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
