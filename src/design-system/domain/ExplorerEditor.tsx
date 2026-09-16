import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ArrowUpDown, BarChart3, BarChartHorizontal, Database, LineChart, MessageSquare, Paintbrush, PieChart, Plus, Table2, Trash2 } from 'lucide-react'
import type * as echarts from 'echarts'
import { EchartsChart } from '@/design-system/charts/EchartsChart'
import { explorerOption } from '@/design-system/charts/explorerOptions'
import { getCategoricalPalette } from '@/design-system/charts/palette'
import { FilterChips } from '@/design-system/patterns/FilterChips'
import { Badge } from '@/design-system/primitives/Badge'
import { Button } from '@/design-system/primitives/Button'
import { Input } from '@/design-system/primitives/Input'
import {
  PIE_MAX_CATEGORIES,
  formatMeasure,
  orderedDimensions,
  resolveChartType,
  rowLabel,
  useExplore,
  useFilterLabels,
  type ChartType,
  type ExploreRequest,
  type ExploreResult,
  type ExploreSource,
  type Presentation,
} from '@/lib/observatory/useExplorer'
import { useResolvedTheme } from '@/lib/theme/useResolvedTheme'

type Tab = 'datos' | 'ejes' | 'formato' | 'ventana'

const TABS: { id: Tab; label: string; icon: typeof Database }[] = [
  { id: 'datos', label: 'Selección de datos', icon: Database },
  { id: 'ejes', label: 'Ejes', icon: ArrowUpDown },
  { id: 'formato', label: 'Formato', icon: Paintbrush },
  { id: 'ventana', label: 'Ventana emergente', icon: MessageSquare },
]

const CHART_TYPES: { id: ChartType; label: string; icon: typeof BarChart3 }[] = [
  { id: 'AUTO', label: 'Automática', icon: BarChart3 },
  { id: 'BAR_HORIZONTAL', label: 'Barras horizontales', icon: BarChartHorizontal },
  { id: 'BAR_VERTICAL', label: 'Columnas', icon: BarChart3 },
  { id: 'LINE', label: 'Línea', icon: LineChart },
  { id: 'PIE', label: 'Torta', icon: PieChart },
  { id: 'TABLE', label: 'Tabla', icon: Table2 },
]

const FIELD = 'flex flex-col gap-1 text-sm text-text-primary'
const SELECT = 'h-[var(--control-height-md)] min-h-[var(--tap-min)] rounded-sm border border-border-strong bg-surface px-2 text-sm text-text-primary'

export interface ExplorerEditorProps {
  catalog: ExploreSource[]
  request: ExploreRequest
  presentation: Presentation
  onRequestChange: (request: ExploreRequest) => void
  onPresentationChange: (presentation: Presentation) => void
  /** Botonera de guardar/publicar: la decide la página según permisos y dueño. */
  actions?: ReactNode
}

/**
 * SPEC-0810: el editor con las cuatro pestañas de la referencia de datos
 * abiertos, y lo que a la referencia le falta: la medida no se elige cuando
 * sólo hay una válida, «Otros» en vez de columnas cortadas, bajada de
 * departamento a municipio, y la pregunta escrita en palabras bajo la gráfica.
 */
export function ExplorerEditor({ catalog, request, presentation, onRequestChange, onPresentationChange, actions }: ExplorerEditorProps) {
  const [tab, setTab] = useState<Tab>('datos')
  const [showTable, setShowTable] = useState(false)
  const [trail, setTrail] = useState<ExploreRequest[]>([])
  const theme = useResolvedTheme()
  const source = catalog.find((candidate) => candidate.code === request.source) ?? catalog[0]!
  const dimension = source.dimensions.find((candidate) => candidate.code === request.dimension) ?? source.dimensions[0]!
  const explore = useExplore(request)
  const result = explore.data

  const setPresentation = (patch: Partial<Presentation>) => onPresentationChange({ ...presentation, ...patch })

  const drill = useCallback(
    (key: string) => {
      if (!dimension.child || key === '__OTHERS__' || key === '__NO_DATA__') return
      setTrail((previous) => [...previous, request])
      onRequestChange({ ...request, dimension: dimension.child, filters: { ...request.filters, [dimension.code]: [key] }, sort: null })
    },
    [dimension, request, onRequestChange],
  )

  const handleChartClick = useCallback(
    (params: echarts.ECElementEvent) => {
      if (!result) return
      const rows = result.others ? [...result.rows, result.others] : result.rows
      const row = rows.find((candidate) => rowLabel(candidate, result.dimension.kind) === params.name || candidate.label === params.name)
      if (row) drill(row.key)
    },
    [result, drill],
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(18rem,22rem)_1fr]">
      <aside className="flex min-w-0 gap-2 rounded-sm border border-border-strong bg-surface p-2">
        <div role="tablist" aria-label="Secciones del editor" aria-orientation="vertical" className="flex flex-col gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              aria-label={label}
              title={label}
              onClick={() => setTab(id)}
              className="flex h-9 w-9 min-h-[var(--tap-min)] min-w-[var(--tap-min)] items-center justify-center rounded-sm text-text-secondary hover:bg-surface-raised aria-selected:bg-surface-raised aria-selected:text-accent"
            >
              <Icon size={18} aria-hidden />
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex min-w-0 flex-1 flex-col gap-3 p-1">
          <h2 className="text-sm font-semibold text-text-primary">{TABS.find((item) => item.id === tab)?.label}</h2>
          {tab === 'datos' && <DataPanel catalog={catalog} source={source} request={request} onChange={(next) => { setTrail([]); onRequestChange(next) }} />}
          {tab === 'ejes' && <AxesPanel presentation={presentation} request={request} onPresentation={setPresentation} onRequest={onRequestChange} />}
          {tab === 'formato' && <FormatPanel presentation={presentation} onChange={setPresentation} />}
          {tab === 'ventana' && <TooltipPanel presentation={presentation} source={source} onChange={setPresentation} />}
        </div>
      </aside>

      <section aria-label="Visualización" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="radiogroup" aria-label="Tipo de gráfica" className="flex flex-wrap gap-1">
            {CHART_TYPES.map(({ id, label, icon: Icon }) => {
              const pieBlocked = id === 'PIE' && result !== undefined && result.rows.length + (result.others ? 1 : 0) > PIE_MAX_CATEGORIES
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={presentation.chartType === id}
                  aria-label={pieBlocked ? `${label}: sólo con ${PIE_MAX_CATEGORIES} categorías o menos` : label}
                  title={pieBlocked ? `Torta sólo con ${PIE_MAX_CATEGORIES} categorías o menos: baje el límite en Selección de datos` : label}
                  disabled={pieBlocked}
                  onClick={() => setPresentation({ chartType: id })}
                  className="flex h-9 w-9 min-h-[var(--tap-min)] min-w-[var(--tap-min)] items-center justify-center rounded-sm border border-transparent text-text-secondary hover:bg-surface-raised disabled:opacity-40 aria-checked:border-accent aria-checked:text-accent"
                >
                  <Icon size={18} aria-hidden />
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>

        <FilterBar source={source} request={request} onChange={(next) => { setTrail([]); onRequestChange(next) }} />

        {trail.length > 0 && (
          <nav aria-label="Niveles" className="flex flex-wrap items-center gap-2 text-sm">
            <Button variant="ghost" size="sm" onClick={() => { const previous = trail.at(-1)!; setTrail(trail.slice(0, -1)); onRequestChange(previous) }}>
              ← Subir un nivel
            </Button>
            <span className="text-text-secondary">
              {trail.map((level) => source.dimensions.find((item) => item.code === level.dimension)?.label).join(' › ')} › {dimension.label}
            </span>
          </nav>
        )}

        <div className="rounded-sm border border-border-strong bg-surface p-3">
          {presentation.title && <h2 className="text-base font-semibold text-text-primary">{presentation.title}</h2>}
          {presentation.description && <p className="text-sm text-text-secondary">{presentation.description}</p>}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-text-muted" aria-live="polite">
              {explore.isFetching ? 'Consultando…' : result ? `Total: ${formatMeasure(result.total, 0)} ${result.measure.plural}` : ''}
            </p>
            <button type="button" onClick={() => setShowTable((value) => !value)} className="min-h-[var(--tap-min)] px-1 text-2xs font-medium text-accent hover:text-accent-hover">
              {showTable ? 'Ver gráfica' : 'Ver tabla'}
            </button>
          </div>
          {explore.isError && (
            <p role="alert" className="py-6 text-sm text-critical">{explore.error instanceof Error ? explore.error.message : 'No se pudo consultar.'}</p>
          )}
          {result && result.rows.length === 0 && <p className="py-10 text-center text-sm text-text-secondary">No hay registros con esta selección.</p>}
          {result && result.rows.length > 0 && (
            showTable || presentation.chartType === 'TABLE'
              ? <ResultTable result={result} presentation={presentation} onDrill={dimension.child ? drill : undefined} />
              : <ChartView result={result} presentation={presentation} theme={theme} onClick={dimension.child ? handleChartClick : undefined} />
          )}
          {dimension.child && result && result.rows.length > 0 && (
            <p className="mt-1 text-xs text-text-muted">
              Clic en {dimension.label.toLowerCase()} para ver por {source.dimensions.find((item) => item.code === dimension.child)?.label.toLowerCase()}. Con teclado, desde la tabla.
            </p>
          )}
        </div>

        {result && (
          <p className="text-sm text-text-secondary">
            <span className="font-medium text-text-primary">Qué muestra: </span>{result.description}
            {presentation.showSourceLink && <> <span className="text-text-muted">Fuente: {source.label}.</span></>}
          </p>
        )}
        {result && presentation.showTable && presentation.chartType !== 'TABLE' && !showTable && result.rows.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-text-primary">Datos de la gráfica</summary>
            <ResultTable result={result} presentation={presentation} onDrill={dimension.child ? drill : undefined} />
          </details>
        )}
      </section>
    </div>
  )
}

function ChartView({ result, presentation, theme, onClick }: {
  result: ExploreResult
  presentation: Presentation
  theme: 'light' | 'dark'
  onClick: ((params: echarts.ECElementEvent) => void) | undefined
}) {
  const type = resolveChartType(result, presentation.chartType)
  const option = useMemo(() => explorerOption(result, presentation, type === 'TABLE' ? 'BAR_VERTICAL' : type, theme), [result, presentation, type, theme])
  const count = result.rows.length + (result.others ? 1 : 0)
  const height = type === 'BAR_HORIZONTAL' ? Math.max(260, count * 26 + 60) : 360
  return <EchartsChart ariaLabel={`${result.measure.label} por ${result.dimension.label.toLowerCase()}. La tabla tiene los mismos datos.`} option={option} height={height} onClick={onClick} />
}

function ResultTable({ result, presentation, onDrill }: { result: ExploreResult; presentation: Presentation; onDrill: ((key: string) => void) | undefined }) {
  const rows = result.others ? [...result.rows, result.others] : result.rows
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-border text-left text-2xs uppercase text-text-muted">
            <th scope="col" className="py-1 pr-3 font-medium">{result.dimension.label}</th>
            <th scope="col" className="py-1 pr-3 text-right font-medium">{result.measure.label}</th>
            <th scope="col" className="py-1 text-right font-medium">% del total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const label = row.key === '__OTHERS__' ? row.label : rowLabel(row, result.dimension.kind)
            const canDrill = onDrill && row.key !== '__OTHERS__' && row.key !== '__NO_DATA__'
            return (
              <tr key={row.key} className="border-b border-border">
                <th scope="row" className="py-1 pr-3 text-left font-normal text-text-primary">
                  {canDrill ? <button type="button" onClick={() => onDrill(row.key)} className="min-h-[var(--tap-min)] text-left text-accent-hover underline">{label}</button> : label}
                  {row.partial && <span className="ml-1 text-xs text-alert">(incompleto)</span>}
                </th>
                <td className="py-1 pr-3 text-right">{formatMeasure(row.value, presentation.decimals)}</td>
                <td className="py-1 text-right text-text-secondary">{result.total === 0 ? '—' : `${((row.value / result.total) * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DataPanel({ catalog, source, request, onChange }: { catalog: ExploreSource[]; source: ExploreSource; request: ExploreRequest; onChange: (request: ExploreRequest) => void }) {
  const dimension = source.dimensions.find((item) => item.code === request.dimension)
  return (
    <>
      <label className={FIELD}>
        Fuente
        <select
          className={SELECT}
          value={source.code}
          onChange={(event) => {
            const next = catalog.find((item) => item.code === event.target.value)!
            onChange({ source: next.code, dimension: next.dimensions.find((item) => item.kind === 'CATEGORY')?.code ?? next.dimensions[0]!.code, filters: {}, limit: request.limit ?? 12 })
          }}
        >
          {catalog.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
      </label>
      <label className={FIELD}>
        Dimensión
        <select className={SELECT} value={request.dimension} onChange={(event) => onChange({ ...request, dimension: event.target.value, sort: null })}>
          {orderedDimensions(source).map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
      </label>
      {dimension?.child && (
        <p className="text-xs text-text-secondary">Jerarquía: {dimension.label} › {source.dimensions.find((item) => item.code === dimension.child)?.label}. Clic en una barra para bajar.</p>
      )}
      <div className={FIELD}>
        <span>Medida</span>
        <p className="rounded-sm border border-border bg-surface-raised px-2 py-2 text-sm">{source.measure.label}</p>
        <p className="text-xs text-text-secondary">
          {source.code === 'OFFICIAL'
            ? 'Suma de la columna CANTIDAD. Cada fila del archivo agrupa víctimas: contar filas daría una cifra falsa, por eso no se ofrece.'
            : 'Cada fila del registro es un hecho.'}
        </p>
      </div>
      {dimension?.kind === 'CATEGORY' && (
        <label className={FIELD}>
          Límite de categorías mostradas
          <Input type="number" min={1} max={50} value={request.limit ?? 12} onChange={(event) => onChange({ ...request, limit: Math.min(50, Math.max(1, Number(event.target.value) || 1)) })} />
          <span className="text-xs text-text-secondary">El resto se agrupa en «Otros»; el total no cambia.</span>
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className={FIELD}>
          Desde
          <Input type="date" value={request.from ?? ''} onChange={(event) => onChange({ ...request, from: event.target.value || null })} />
        </label>
        <label className={FIELD}>
          Hasta
          <Input type="date" value={request.to ?? ''} onChange={(event) => onChange({ ...request, to: event.target.value || null })} />
        </label>
      </div>
    </>
  )
}

function AxesPanel({ presentation, request, onPresentation, onRequest }: { presentation: Presentation; request: ExploreRequest; onPresentation: (patch: Partial<Presentation>) => void; onRequest: (request: ExploreRequest) => void }) {
  const [line, setLine] = useState({ value: '', label: '' })
  return (
    <>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="mb-1 font-medium text-text-primary">Escala del eje</legend>
        {([['ZERO_TO_MAX', 'Desde cero hasta el máximo'], ['MIN_TO_MAX', 'Del mínimo al máximo'], ['CUSTOM', 'Personalizada']] as const).map(([value, label]) => (
          <label key={value} className="flex min-h-[var(--tap-min)] items-center gap-2 text-text-primary">
            <input type="radio" name="scale" checked={presentation.scale === value} onChange={() => onPresentation({ scale: value, ...(value === 'CUSTOM' && presentation.scaleMax === null ? { scaleMin: 0, scaleMax: 100 } : {}) })} />
            {label}
          </label>
        ))}
        {presentation.scale === 'MIN_TO_MAX' && <p className="text-xs text-alert">Sin empezar en cero, una diferencia pequeña parece grande.</p>}
        {presentation.scale === 'CUSTOM' && (
          <div className="grid grid-cols-2 gap-2">
            <label className={FIELD}>Mínimo<Input type="number" value={presentation.scaleMin ?? ''} onChange={(event) => onPresentation({ scaleMin: Number(event.target.value) })} /></label>
            <label className={FIELD}>Máximo<Input type="number" value={presentation.scaleMax ?? ''} onChange={(event) => onPresentation({ scaleMax: Number(event.target.value) })} /></label>
          </div>
        )}
      </fieldset>
      <label className={FIELD}>
        Decimales: {presentation.decimals}
        <input type="range" min={0} max={3} value={presentation.decimals} onChange={(event) => onPresentation({ decimals: Number(event.target.value) })} />
      </label>
      <label className={FIELD}>
        Orden
        <select className={SELECT} value={request.sort ?? ''} onChange={(event) => onRequest({ ...request, sort: (event.target.value || null) as ExploreRequest['sort'] })}>
          <option value="">Automático</option>
          <option value="VALUE_DESC">De mayor a menor</option>
          <option value="VALUE_ASC">De menor a mayor</option>
          <option value="LABEL_ASC">Alfabético o cronológico</option>
        </select>
      </label>
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 font-medium text-text-primary">Líneas de referencia</legend>
        {presentation.referenceLines.map((item, index) => (
          <div key={`${item.label}-${index}`} className="flex items-center justify-between gap-2 text-text-primary">
            <span>{item.label}: {item.value.toLocaleString('es-CO')}</span>
            <Button variant="ghost" size="sm" aria-label={`Quitar la línea ${item.label}`} onClick={() => onPresentation({ referenceLines: presentation.referenceLines.filter((_, position) => position !== index) })}>
              <Trash2 size={16} aria-hidden />
            </Button>
          </div>
        ))}
        {presentation.referenceLines.length < 5 && (
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <label className={FIELD}>Valor<Input type="number" value={line.value} onChange={(event) => setLine({ ...line, value: event.target.value })} /></label>
            <label className={FIELD}>Rótulo<Input value={line.label} maxLength={60} onChange={(event) => setLine({ ...line, label: event.target.value })} /></label>
            <Button variant="secondary" size="sm" aria-label="Agregar línea de referencia" disabled={line.value === '' || line.label.trim() === ''} onClick={() => { onPresentation({ referenceLines: [...presentation.referenceLines, { value: Number(line.value), label: line.label.trim() }] }); setLine({ value: '', label: '' }) }}>
              <Plus size={16} aria-hidden />
            </Button>
          </div>
        )}
      </fieldset>
    </>
  )
}

function FormatPanel({ presentation, onChange }: { presentation: Presentation; onChange: (patch: Partial<Presentation>) => void }) {
  const theme = useResolvedTheme()
  const palette = getCategoricalPalette(theme)
  const check = (key: 'showSourceLink' | 'showTable' | 'showDimensionLabels' | 'showValueLabels', label: string) => (
    <label className="flex min-h-[var(--tap-min)] items-center gap-2 text-sm text-text-primary">
      <input type="checkbox" checked={presentation[key]} onChange={(event) => onChange({ [key]: event.target.checked })} />
      {label}
    </label>
  )
  return (
    <>
      <label className={FIELD}>Título<Input value={presentation.title ?? ''} maxLength={160} onChange={(event) => onChange({ title: event.target.value || null })} /></label>
      <label className={FIELD}>
        Descripción
        <textarea value={presentation.description ?? ''} maxLength={600} rows={3} onChange={(event) => onChange({ description: event.target.value || null })} className="rounded-sm border border-border-strong bg-surface px-2 py-1 text-sm text-text-primary" />
      </label>
      {check('showSourceLink', 'Mostrar la fuente')}
      {check('showTable', 'Mostrar la tabla de datos debajo')}
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="mb-1 font-medium text-text-primary">Color de la serie</legend>
        <div role="radiogroup" aria-label="Color de la serie" className="flex flex-wrap gap-1">
          {palette.map((swatch, index) => (
            <button key={swatch} type="button" role="radio" aria-checked={presentation.colorSlot === index} aria-label={`Color ${index + 1}`} onClick={() => onChange({ colorSlot: index })}
              className="flex h-9 w-9 min-h-[var(--tap-min)] min-w-[var(--tap-min)] items-center justify-center rounded-sm border border-transparent aria-checked:border-text-primary">
              <span className="h-6 w-6 rounded-sm" style={{ backgroundColor: swatch }} />
            </button>
          ))}
        </div>
        <p className="text-xs text-text-secondary">En la torta cada categoría conserva su color aunque se filtre; «Otros» va siempre en gris.</p>
      </fieldset>
      {check('showDimensionLabels', 'Mostrar etiquetas de la dimensión')}
      {check('showValueLabels', 'Mostrar etiquetas de valor')}
      <label className={FIELD}>
        Ángulo de las etiquetas: {presentation.labelAngle}°
        <input type="range" min={0} max={90} step={15} value={presentation.labelAngle} onChange={(event) => onChange({ labelAngle: Number(event.target.value) })} />
      </label>
      <label className={FIELD}>Título del eje de valores<Input value={presentation.valueAxisTitle ?? ''} maxLength={60} onChange={(event) => onChange({ valueAxisTitle: event.target.value || null })} /></label>
      <label className={FIELD}>Título del eje de categorías<Input value={presentation.dimensionAxisTitle ?? ''} maxLength={60} onChange={(event) => onChange({ dimensionAxisTitle: event.target.value || null })} /></label>
    </>
  )
}

function TooltipPanel({ presentation, source, onChange }: { presentation: Presentation; source: ExploreSource; onChange: (patch: Partial<Presentation>) => void }) {
  const singular = presentation.tooltipSingular || source.measure.singular
  const plural = presentation.tooltipPlural || source.measure.plural
  return (
    <>
      <p className="text-sm text-text-secondary">Cómo se nombra la medida al pasar el cursor.</p>
      <label className={FIELD}>Singular<Input value={presentation.tooltipSingular ?? ''} placeholder={source.measure.singular} maxLength={60} onChange={(event) => onChange({ tooltipSingular: event.target.value || null })} /></label>
      <label className={FIELD}>Plural<Input value={presentation.tooltipPlural ?? ''} placeholder={source.measure.plural} maxLength={60} onChange={(event) => onChange({ tooltipPlural: event.target.value || null })} /></label>
      <p className="rounded-sm border border-border bg-surface-raised p-2 text-sm text-text-primary">Vista previa: Antioquia: <strong>1</strong> {singular} · Bogotá: <strong>1.253</strong> {plural}</p>
    </>
  )
}

function FilterBar({ source, request, onChange }: { source: ExploreSource; request: ExploreRequest; onChange: (request: ExploreRequest) => void }) {
  const categories = orderedDimensions(source).filter((item) => item.kind === 'CATEGORY')
  const [open, setOpen] = useState<string>('')
  const options = useExplore(open ? { source: source.code, dimension: open, filters: {}, limit: 50 } : null)
  const selected = open ? request.filters[open] ?? [] : []

  const filteredDimensions = Object.keys(request.filters).filter((code) => (request.filters[code] ?? []).length > 0)
  const names = useFilterLabels(source.code, filteredDimensions)
  const applied = Object.entries(request.filters).flatMap(([code, values]) =>
    values.map((value) => ({ key: `${code}:${value}`, label: source.dimensions.find((item) => item.code === code)?.label ?? code, value: names[code]?.[value] ?? value })),
  )

  function toggle(value: string, checked: boolean) {
    const current = request.filters[open] ?? []
    const next = checked ? [...current, value] : current.filter((item) => item !== value)
    onChange({ ...request, filters: { ...request.filters, [open]: next } })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className={FIELD}>
          Filtrar por
          <select className={SELECT} value={open} onChange={(event) => setOpen(event.target.value)}>
            <option value="">Elegir una dimensión…</option>
            {categories.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select>
        </label>
        {open && <Badge tone="neutral">{selected.length} elegidos</Badge>}
      </div>
      {open && options.data && (
        <fieldset className="max-h-56 overflow-y-auto rounded-sm border border-border p-2">
          <legend className="px-1 text-xs text-text-secondary">Valores de {categories.find((item) => item.code === open)?.label.toLowerCase()} (los 50 con más {source.measure.plural})</legend>
          <div className="grid gap-x-3 sm:grid-cols-2">
            {options.data.rows.filter((row) => row.key !== '__NO_DATA__').map((row) => (
              <label key={row.key} className="flex min-h-[var(--tap-min)] items-center gap-2 text-sm text-text-primary">
                <input type="checkbox" checked={selected.includes(row.key)} onChange={(event) => toggle(row.key, event.target.checked)} />
                <span className="truncate">{row.label}</span>
                <span className="ml-auto text-xs text-text-muted">{formatMeasure(row.value, 0)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <FilterChips
        filters={applied}
        onRemove={(key) => {
          const [code, ...rest] = key.split(':')
          const value = rest.join(':')
          onChange({ ...request, filters: { ...request.filters, [code!]: (request.filters[code!] ?? []).filter((item) => item !== value) } })
        }}
        onClearAll={() => onChange({ ...request, filters: {} })}
      />
    </div>
  )
}
