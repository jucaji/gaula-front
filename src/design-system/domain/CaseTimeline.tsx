import { AlertTriangle, FileText, Radio, ShieldAlert } from 'lucide-react'
import type { TimelineEntryResponse } from '@/api/generated/models'
import { formatDateTime, formatDuration } from '@/lib/format/formatDateTime'

const SOURCE_ICON: Record<string, typeof FileText> = {
  CASEFILE: FileText,
  INTAKE: Radio,
  REPORTING: ShieldAlert,
}

/**
 * S3.FE.01, criterio A9: cada entrada muestra su fuente (módulo + tipo) y,
 * cuando aplica, una marca visible de registro tardío -- nunca sólo el
 * booleano `recordedLate` sin explicar cuánto tardó (docs/03 §1.4).
 */
export function CaseTimeline({ entries }: { entries: TimelineEntryResponse[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-text-secondary">Sin actividad registrada todavía.</p>
  }

  return (
    <ol className="flex flex-col gap-4">
      {entries.map((entry) => {
        const Icon = SOURCE_ICON[entry.sourceModule ?? ''] ?? FileText
        return (
          <li key={entry.id} className="flex gap-3 border-b border-border pb-4 last:border-0">
            <Icon size={16} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-text-primary">{entry.title}</span>
                {entry.recordedLate && (
                  <span className="inline-flex items-center gap-1 text-2xs font-medium text-alert">
                    <AlertTriangle size={12} aria-hidden />
                    Registrado {entry.occurredAt && entry.recordedAt ? formatDuration(entry.occurredAt, entry.recordedAt) : 'tarde'}
                  </span>
                )}
              </div>
              {entry.detail && <p className="mt-1 text-sm text-text-secondary">{entry.detail}</p>}
              <p className="mt-1 text-2xs text-text-muted">
                {formatDateTime(entry.occurredAt)} · fuente: {entry.sourceModule?.toLowerCase()} · {entry.entryType}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
