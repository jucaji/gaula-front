import { ShieldAlert } from 'lucide-react'

const RESERVED_LABEL: Record<string, string> = {
  RESTRICTED: 'RESTRINGIDO',
  SECRET: 'RESERVADO',
}

/**
 * docs/06 §7.2: franja permanente en casos RESTRICTED/SECRET, "siempre
 * visible, no se descarta" -- por eso no tiene botón de cerrar ni
 * animación de salida. PUBLIC no renderiza nada.
 */
export function ClassificationBanner({ classificationLevel }: { classificationLevel: string }) {
  const label = RESERVED_LABEL[classificationLevel]
  if (!label) return null

  return (
    <div className="flex items-center gap-2 bg-danger px-4 py-1.5 text-xs font-semibold tracking-wide text-on-danger uppercase">
      <ShieldAlert size={14} strokeWidth={2} aria-hidden />
      Caso {label} — acceso restringido y auditado
    </div>
  )
}
