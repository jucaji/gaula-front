import { useEffect, useId, useState } from 'react'
import clsx from 'clsx'
import type { MunicipalityResponse } from '@/api/generated/models'
import { Input } from '@/design-system/primitives/Input'
import { useMunicipalitySearch } from '@/lib/catalog/useCatalog'

export type MunicipalityOption = MunicipalityResponse

function municipalityText(option: MunicipalityOption) {
  return [option.name ?? option.code, option.departmentName].filter(Boolean).join(', ')
}

interface MunicipalityComboboxProps {
  label: string
  value: MunicipalityOption | null
  onChange: (value: MunicipalityOption | null) => void
  size?: 'sm' | 'md'
  placeholder?: string
  /**
   * S4.QA.01 (criterio A1, ≤3 interacciones): si al escribir sólo queda una
   * coincidencia, se elige sola. Recepción lo necesita; un formulario sin prisa
   * prefiere que la persona confirme.
   */
  autoSelectSingleMatch?: boolean
  className?: string
  labelClassName?: string
}

/**
 * SPEC-0108: el municipio se busca, no se digita. Acepta nombre («fusa») o
 * código («25290») y cada opción dice su departamento, su código y a qué GAULA
 * va —o que no tiene uno—, para que un municipio sin enrutamiento se vea antes
 * de enviar y no en un 422 después.
 *
 * <p>Patrón combobox de WAI-ARIA: el foco se queda en el campo; flechas recorren,
 * Enter elige, Escape cierra.
 */
export function MunicipalityCombobox({
  label,
  value,
  onChange,
  size = 'md',
  placeholder = 'Nombre o código DIVIPOLA',
  autoSelectSingleMatch = false,
  className,
  labelClassName,
}: MunicipalityComboboxProps) {
  const id = useId()
  const listId = `${id}-opciones`
  // `null` = mostrando lo elegido; un texto = la persona está buscando.
  const [query, setQuery] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const searching = query !== null && value === null
  const matches = useMunicipalitySearch(searching ? query : '')
  const options = searching && Array.isArray(matches.data) ? matches.data : []
  const expanded = open && searching && query.trim().length >= 2 && (options.length > 0 || matches.isSuccess)
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0))
  const text = query ?? (value ? municipalityText(value) : '')

  function select(option: MunicipalityOption) {
    setQuery(null)
    setOpen(false)
    setActive(0)
    onChange(option)
  }

  useEffect(() => {
    const only = options.length === 1 ? options[0] : undefined
    if (!autoSelectSingleMatch || !searching || !only) return
    // El resultado ya llegó asíncrono (react-query); esto sólo evita el
    // `setState` síncrono dentro del cuerpo del efecto.
    queueMicrotask(() => select(only))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches.data])

  return (
    <div className={clsx('relative flex flex-col gap-1', className)}>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && options[activeIndex] ? `${id}-${options[activeIndex].code}` : undefined}
          autoComplete="off"
          size={size}
          value={text}
          placeholder={placeholder}
          className={value ? 'pr-9' : undefined}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            setActive(0)
            if (value) onChange(null)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setOpen(true)
              setActive(Math.min(activeIndex + 1, options.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive(Math.max(activeIndex - 1, 0))
            } else if (event.key === 'Enter' && expanded && options[activeIndex]) {
              // Sin esto, Enter enviaría el formulario con el municipio a medio elegir.
              event.preventDefault()
              select(options[activeIndex])
            } else if (event.key === 'Escape' && expanded) {
              event.preventDefault()
              setOpen(false)
            }
          }}
        />
        {value && (
          <button
            type="button"
            aria-label={`Quitar ${label.toLowerCase()}`}
            onClick={() => {
              setQuery('')
              onChange(null)
            }}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-text-secondary hover:text-text-primary"
          >
            ×
          </button>
        )}
      </div>

      {expanded && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute top-full z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-sm border border-border-strong bg-surface-raised shadow-sm"
        >
          {options.map((option, index) => (
            // El teclado lo maneja el campo (patrón combobox): la opción sólo
            // necesita el clic, y `onMouseDown` evita que el campo pierda el foco.
            <li
              key={option.code}
              id={`${id}-${option.code}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => select(option)}
              className={clsx(
                'flex cursor-pointer flex-wrap items-baseline justify-between gap-x-3 px-2.5 py-2 text-sm',
                index === activeIndex && 'bg-surface-sunken',
              )}
            >
              <span>
                <span className="font-medium text-text-primary">{option.name}</span>{' '}
                <span className="text-text-secondary">
                  · {option.departmentName} · {option.code}
                </span>
              </span>
              <span className={clsx('text-xs', option.territorialUnitName ? 'text-text-secondary' : 'text-alert')}>
                {option.territorialUnitName ?? 'Sin GAULA asignado'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {expanded && options.length === 0 && (
        <p
          role="status"
          className="absolute top-full z-20 mt-1 w-full rounded-sm border border-border-strong bg-surface-raised px-2.5 py-2 text-sm text-text-secondary shadow-sm"
        >
          Ningún municipio coincide con «{query}».
        </p>
      )}
    </div>
  )
}
