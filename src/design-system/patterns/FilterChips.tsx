import { X } from 'lucide-react'

export interface AppliedFilter {
  /** La clave del filtro en la URL; es lo que se borra al quitar la ficha. */
  key: string
  label: string
  value: string
}

/**
 * SPEC-0807 CA-3: los filtros puestos, a la vista y quitables de a uno.
 *
 * <p>Con seis filtros repartidos entre cajas de texto, fechas y listas, es fácil
 * quedarse mirando una cifra sin recordar que hay tres filtros activos —y
 * concluir cualquier cosa de ella—. La ficha hace visible lo que está recortando
 * el dato, y la equis lo deshace donde se está viendo.
 */
export function FilterChips({
  filters,
  onRemove,
  onClearAll,
}: {
  filters: AppliedFilter[]
  onRemove: (key: string) => void
  onClearAll: () => void
}) {
  if (filters.length === 0) return null

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Filtros aplicados" role="group">
      {filters.map((filter) => (
        <span
          key={filter.key}
          className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-surface-raised py-1 pl-2.5 pr-1 text-2xs text-text-secondary"
        >
          <span className="text-text-muted">{filter.label}:</span>
          <span className="font-medium text-text-primary">{filter.value}</span>
          <button
            type="button"
            onClick={() => onRemove(filter.key)}
            aria-label={`Quitar filtro ${filter.label}: ${filter.value}`}
            className="flex size-[var(--tap-min)] items-center justify-center rounded-full text-text-muted hover:text-text-primary sm:size-5"
          >
            <X size={12} strokeWidth={2} aria-hidden />
          </button>
        </span>
      ))}
      {filters.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-2xs text-text-secondary underline underline-offset-2 hover:text-text-primary"
        >
          Quitar todos
        </button>
      )}
    </div>
  )
}
