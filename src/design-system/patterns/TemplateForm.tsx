import type { TemplateFieldResponse as TemplateField, TemplateSectionResponse as TemplateSection } from '@/api/generated/models'
import type { ApiFieldError } from '@/api/problem'
import { Input } from '@/design-system/primitives/Input'
import { getAtPath, type ReportPayload } from '@/lib/reporting/templatePath'

function errorAt(errors: ApiFieldError[], path: string): string | undefined {
  return errors.find((error) => error.field === path)?.message
}

const todayIso = () => new Date().toISOString().slice(0, 10)

/**
 * S6.FE.01: el JSON de `TemplateSection[]` dibuja el formulario -- cambiar
 * la plantilla en el backend (una nueva versión, S6.DOM.01) cambia lo que
 * se pinta aquí sin tocar una línea de este componente. S6.FE.02: cada
 * campo muestra, bajo de sí, el mensaje de violación que el backend haya
 * devuelto para su mismo `path` (idéntico formato indexado que
 * `results.seizures[0].quantity`, docs/05 §4).
 */
export function TemplateForm({
  sections,
  values,
  errors,
  onFieldChange,
  readOnly = false,
}: {
  sections: TemplateSection[]
  values: ReportPayload
  errors: ApiFieldError[]
  onFieldChange: (path: string, value: unknown) => void
  /** Vista de sólo lectura -- UNDER_REVIEW/VALIDATED/REJECTED nunca se editan desde aquí. */
  readOnly?: boolean
}) {
  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <fieldset key={section.code} disabled={readOnly} className="flex flex-col gap-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-text-muted">{section.title}</legend>
          {section.fields?.map((field) => (
            <FieldRenderer key={field.code} field={field} path={field.code ?? ''} values={values} errors={errors} onFieldChange={onFieldChange} />
          ))}
        </fieldset>
      ))}
    </div>
  )
}

function FieldRenderer({
  field,
  path,
  values,
  errors,
  onFieldChange,
}: {
  field: TemplateField
  path: string
  values: ReportPayload
  errors: ApiFieldError[]
  onFieldChange: (path: string, value: unknown) => void
}) {
  const value = getAtPath(values, path)
  const error = errorAt(errors, path)
  const label = `${field.label ?? field.code}${field.required ? ' *' : ''}`

  if (field.type === 'OBJECT') {
    return (
      <div className="rounded-sm border border-border-strong p-3">
        <p className="mb-2 text-sm font-medium text-text-primary">{label}</p>
        <div className="flex flex-col gap-3">
          {field.fields?.map((sub) => (
            <FieldRenderer key={sub.code} field={sub} path={`${path}.${sub.code}`} values={values} errors={errors} onFieldChange={onFieldChange} />
          ))}
        </div>
        {error && <p className="mt-1 text-2xs text-critical">{error}</p>}
      </div>
    )
  }

  if (field.type === 'ARRAY_OF_OBJECT') {
    const items = Array.isArray(value) ? (value as ReportPayload[]) : []
    return (
      <div>
        <p className="mb-2 text-sm font-medium text-text-primary">{label}</p>
        <div className="flex flex-col gap-2">
          {items.map((_, index) => (
            // key por índice: son filas nuevas sin id propio, no hay ningún identificador estable disponible todavía.
            <div key={index} className="flex items-start gap-2 rounded-sm border border-border-strong p-2">
              <div className="flex flex-1 flex-col gap-2">
                {field.fields?.map((sub) => (
                  <FieldRenderer
                    key={sub.code}
                    field={sub}
                    path={`${path}[${index}].${sub.code}`}
                    values={values}
                    errors={errors}
                    onFieldChange={onFieldChange}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => onFieldChange(path, items.filter((_, i) => i !== index))}
                className="text-2xs text-text-muted hover:text-critical"
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onFieldChange(path, [...items, {}])}
          className="mt-2 text-2xs font-medium text-accent hover:text-accent-hover"
        >
          + Agregar
        </button>
        {error && <p className="mt-1 text-2xs text-critical">{error}</p>}
      </div>
    )
  }

  if (field.type === 'BOOLEAN') {
    return (
      <label className="flex items-center gap-2 text-sm text-text-primary">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onFieldChange(path, event.target.checked)} />
        {label}
        {error && <span className="text-2xs text-critical">{error}</span>}
      </label>
    )
  }

  if (field.type === 'ENUM') {
    return (
      <label className="flex flex-col gap-1 text-sm text-text-primary">
        {label}
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onFieldChange(path, event.target.value || undefined)}
          className="h-[var(--control-height-md)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary"
        >
          <option value="">Seleccione…</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {error && <span className="text-2xs text-critical">{error}</span>}
      </label>
    )
  }

  if (field.type === 'TEXT') {
    return (
      <label className="flex flex-col gap-1 text-sm text-text-primary">
        {label}
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onFieldChange(path, event.target.value)}
          maxLength={field.maxLength}
          rows={4}
          className="rounded-sm border border-border-strong bg-surface px-2.5 py-2 text-sm text-text-primary"
        />
        {error && <span className="text-2xs text-critical">{error}</span>}
      </label>
    )
  }

  if (field.type === 'INTEGER' || field.type === 'DECIMAL') {
    return (
      <label className="flex flex-col gap-1 text-sm text-text-primary">
        {label}
        <Input
          type="number"
          step={field.type === 'INTEGER' ? 1 : 'any'}
          min={field.min}
          max={field.max}
          invalid={Boolean(error)}
          value={typeof value === 'number' ? value : ''}
          onChange={(event) => onFieldChange(path, event.target.value === '' ? undefined : Number(event.target.value))}
        />
        {error && <span className="text-2xs text-critical">{error}</span>}
      </label>
    )
  }

  if (field.type === 'DATE') {
    return (
      <label className="flex flex-col gap-1 text-sm text-text-primary">
        {label}
        <Input
          type="date"
          max={field.notFuture ? todayIso() : undefined}
          invalid={Boolean(error)}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onFieldChange(path, event.target.value)}
        />
        {error && <span className="text-2xs text-critical">{error}</span>}
      </label>
    )
  }

  // STRING (y cualquier tipo futuro que este motor todavía no conozca) cae aquí.
  return (
    <label className="flex flex-col gap-1 text-sm text-text-primary">
      {label}
      <Input
        maxLength={field.maxLength}
        invalid={Boolean(error)}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onFieldChange(path, event.target.value)}
      />
      {error && <span className="text-2xs text-critical">{error}</span>}
    </label>
  )
}
