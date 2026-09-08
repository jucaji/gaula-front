import { CalendarClock, AlertTriangle } from 'lucide-react'
import { useActiveSnapshot } from '@/lib/observatory/useActiveSnapshot'
import { formatDateTime } from '@/lib/format/formatDateTime'

const CUTOFF_DATE = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' })

/**
 * S13.FE.03 -- la banda de vigencia, PERMANENTE sobre cada pantalla del
 * observatorio.
 *
 * <p>Reemplaza el `VERSIÓN 27` escrito a mano sobre la lámina que hoy ve el
 * comando (docs/00 §8.1): quien mira una cifra tiene que saber, sin
 * preguntarle a nadie y sin entrar a una pantalla de administración, DE QUÉ
 * CORTE viene, con qué fecha y quién lo cargó. Es el antídoto exacto a la
 * falla que motivó el módulo: dos personas discutiendo cifras distintas
 * porque cada una abrió un archivo distinto.
 *
 * <p>Cuando no hay ningún corte cargado lo DICE. Una banda vacía sería peor
 * que ninguna: parecería que el tablero está al día.
 */
export function SnapshotBand() {
  const { data: snapshot, isLoading, isError } = useActiveSnapshot()

  if (isLoading) {
    return (
      <div className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-2xs text-text-muted">
        Consultando el corte vigente…
      </div>
    )
  }

  if (isError || !snapshot) {
    return (
      <div
        className="flex items-start gap-2 rounded-sm border border-border-strong bg-surface-raised px-3 py-2"
        role="status"
      >
        <AlertTriangle size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-alert" aria-hidden />
        <div className="text-2xs text-text-secondary">
          <p className="text-xs font-semibold text-text-primary">Sin corte vigente</p>
          <p>
            {isError
              ? 'No se pudo consultar el corte vigente. Las cifras que se vean abajo no tienen procedencia verificable.'
              : 'Todavía no se ha cargado ningún corte del registro nacional. No hay cifras que mostrar.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-sm border border-border-strong bg-surface-raised px-3 py-2"
      role="status"
      aria-label="Corte de datos vigente"
    >
      <span className="flex items-center gap-2 text-xs font-semibold text-text-primary">
        <CalendarClock size={16} strokeWidth={1.5} className="text-accent" aria-hidden />
        Corte al {CUTOFF_DATE.format(new Date(`${snapshot.cutoffDate}T00:00:00`))}
      </span>
      {snapshot.label && <span className="text-2xs text-text-secondary">{snapshot.label}</span>}
      <span className="text-2xs text-text-secondary">Fuente: {snapshot.source}</span>
      <span className="text-2xs text-text-secondary">
        {snapshot.incidentCount.toLocaleString('es-CO')} hechos
      </span>
      <span className="text-2xs text-text-muted">
        Cargado por {snapshot.loadedByName ?? 'un usuario que ya no existe'} · {formatDateTime(snapshot.loadedAt)}
      </span>
    </div>
  )
}
