import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { customFetch } from '@/api/client'

/** SPEC-0810: el explorador. El catálogo lo manda el backend; la consola no tiene listas propias. */
export type ExploreSourceCode = 'OFFICIAL' | 'INCIDENTS'
export type DimensionKind = 'YEAR' | 'MONTH' | 'CATEGORY'
export type ExploreSort = 'VALUE_DESC' | 'VALUE_ASC' | 'LABEL_ASC'
export type ChartType = 'AUTO' | 'BAR_HORIZONTAL' | 'BAR_VERTICAL' | 'LINE' | 'PIE' | 'TABLE'
export type ScaleMode = 'ZERO_TO_MAX' | 'MIN_TO_MAX' | 'CUSTOM'

export interface ExploreMeasure {
  code: string
  label: string
  singular: string
  plural: string
}

export interface ExploreDimension {
  code: string
  label: string
  kind: DimensionKind
  child: string | null
}

export interface ExploreSource {
  code: ExploreSourceCode
  label: string
  measure: ExploreMeasure
  dimensions: ExploreDimension[]
}

export interface ExploreRequest {
  source: ExploreSourceCode
  dimension: string
  measure?: string | null | undefined
  filters: Record<string, string[]>
  from?: string | null | undefined
  to?: string | null | undefined
  sort?: ExploreSort | null | undefined
  limit?: number | null | undefined
}

export interface ExploreRow {
  key: string
  label: string
  value: number
  partial: boolean
}

export interface ExploreResult {
  source: ExploreSourceCode
  dimension: ExploreDimension
  measure: ExploreMeasure
  rows: ExploreRow[]
  others: ExploreRow | null
  total: number
  firstDate: string | null
  cutoffDate: string | null
  colorOrder: string[]
  description: string
}

export interface Presentation {
  chartType: ChartType
  scale: ScaleMode
  scaleMin: number | null
  scaleMax: number | null
  decimals: number
  referenceLines: { value: number; label: string }[]
  title: string | null
  description: string | null
  showSourceLink: boolean
  showTable: boolean
  showDimensionLabels: boolean
  showValueLabels: boolean
  labelAngle: number
  valueAxisTitle: string | null
  dimensionAxisTitle: string | null
  colorSlot: number
  tooltipSingular: string | null
  tooltipPlural: string | null
}

export interface Visualization {
  id: string
  mine: boolean
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  version: number
  query: ExploreRequest
  presentation: Presentation
  createdAt: string
  updatedAt: string
  publishedAt: string | null
}

export const DEFAULT_PRESENTATION: Presentation = {
  chartType: 'AUTO',
  scale: 'ZERO_TO_MAX',
  scaleMin: null,
  scaleMax: null,
  decimals: 0,
  referenceLines: [],
  title: null,
  description: null,
  showSourceLink: true,
  showTable: true,
  showDimensionLabels: true,
  showValueLabels: false,
  labelAngle: 0,
  valueAxisTitle: null,
  dimensionAxisTitle: null,
  colorSlot: 2,
  tooltipSingular: null,
  tooltipPlural: null,
}

export const DEFAULT_REQUEST: ExploreRequest = {
  source: 'OFFICIAL',
  dimension: 'department',
  filters: { series: ['KIDNAPPING'] },
  from: null,
  to: null,
  sort: null,
  limit: 12,
}

const BASE = '/api/v1/observatory'
const KEY = ['observatory', 'explore'] as const

export function useExploreCatalog() {
  return useQuery({
    queryKey: [...KEY, 'catalog'],
    queryFn: () => customFetch<ExploreSource[]>(`${BASE}/explore/catalog`),
    staleTime: Infinity,
    networkMode: 'always',
    retry: false,
  })
}

/** Sin filtros vacíos en la clave: `{series: []}` y `{}` son la misma pregunta. */
export function normalizeRequest(request: ExploreRequest): ExploreRequest {
  const filters = Object.fromEntries(Object.entries(request.filters).filter(([, values]) => values.length > 0))
  return { ...request, filters }
}

export function useExplore(request: ExploreRequest | null) {
  const normalized = request ? normalizeRequest(request) : null
  return useQuery({
    queryKey: [...KEY, 'result', normalized],
    queryFn: () => customFetch<ExploreResult>(`${BASE}/explore`, { method: 'POST', body: JSON.stringify(normalized) }),
    enabled: normalized !== null,
    staleTime: 30_000,
    networkMode: 'always',
    retry: false,
    // Cambiar un control no desmonta la gráfica mientras llega la respuesta (SPEC-0807).
    placeholderData: keepPreviousData,
  })
}

/**
 * Los nombres de los valores filtrados, por dimensión: la ficha del filtro dice
 * «Secuestro», no «KIDNAPPING». Usa la misma pregunta que llena el selector de
 * valores, así que casi siempre ya está en caché.
 */
export function useFilterLabels(source: ExploreSourceCode, dimensions: string[]): Record<string, Record<string, string>> {
  const results = useQueries({
    queries: dimensions.map((dimension) => {
      const request = normalizeRequest({ source, dimension, filters: {}, limit: 50 })
      return {
        queryKey: [...KEY, 'result', request],
        queryFn: () => customFetch<ExploreResult>(`${BASE}/explore`, { method: 'POST', body: JSON.stringify(request) }),
        staleTime: 30_000,
        networkMode: 'always' as const,
        retry: false,
      }
    }),
  })
  return Object.fromEntries(dimensions.map((dimension, index) => [
    dimension,
    Object.fromEntries((results[index]?.data?.rows ?? []).map((row) => [row.key, row.label])),
  ]))
}

export function useVisualizations() {
  return useQuery({
    queryKey: [...KEY, 'visualizations'],
    queryFn: () => customFetch<Visualization[]>(`${BASE}/visualizations`),
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

export function useVisualization(id: string | undefined) {
  return useQuery({
    queryKey: [...KEY, 'visualizations', id],
    queryFn: () => customFetch<Visualization>(`${BASE}/visualizations/${id}`),
    enabled: Boolean(id),
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

export function useVisualizationMutations() {
  const queryClient = useQueryClient()
  const refresh = (saved: Visualization) => {
    queryClient.setQueryData([...KEY, 'visualizations', saved.id], saved)
    return queryClient.invalidateQueries({ queryKey: [...KEY, 'visualizations'], exact: true })
  }
  const body = (value: unknown) => JSON.stringify(value)

  const create = useMutation({
    mutationFn: ({ query, presentation }: { query: ExploreRequest; presentation: Presentation }) =>
      customFetch<Visualization>(`${BASE}/visualizations`, { method: 'POST', body: body({ query: normalizeRequest(query), presentation }) }),
    onSuccess: refresh,
  })
  const edit = useMutation({
    mutationFn: ({ id, version, query, presentation }: { id: string; version: number; query: ExploreRequest; presentation: Presentation }) =>
      customFetch<Visualization>(`${BASE}/visualizations/${id}`, { method: 'PUT', body: body({ version, query: normalizeRequest(query), presentation }) }),
    onSuccess: refresh,
  })
  const publish = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      customFetch<Visualization>(`${BASE}/visualizations/${id}/publish`, { method: 'POST', body: body({ version }) }),
    onSuccess: refresh,
  })
  const archive = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      customFetch<Visualization>(`${BASE}/visualizations/${id}/archive`, { method: 'POST', body: body({ version }) }),
    onSuccess: refresh,
  })
  return { create, edit, publish, archive }
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** La etiqueta de una fila tal como se lee: «jul 2026» para un mes. */
export function rowLabel(row: ExploreRow, kind: DimensionKind): string {
  if (kind === 'MONTH' && /^\d{4}-\d{2}$/.test(row.key)) {
    return `${MONTHS[Number(row.key.slice(5, 7)) - 1]} ${row.key.slice(0, 4)}`
  }
  return row.label
}

export function formatMeasure(value: number, decimals: number): string {
  return value.toLocaleString('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/**
 * Para los selectores: primero el tiempo, y cada dimensión seguida de su nivel
 * inferior (Delito › Conducta, Departamento › Municipio). El catálogo llega en el
 * orden del enum, que declara al hijo antes que al padre.
 */
export function orderedDimensions(source: ExploreSource): ExploreDimension[] {
  const children = new Set(source.dimensions.map((item) => item.child).filter(Boolean))
  const ordered: ExploreDimension[] = source.dimensions.filter((item) => item.kind !== 'CATEGORY')
  for (const item of source.dimensions.filter((candidate) => candidate.kind === 'CATEGORY' && !children.has(candidate.code))) {
    ordered.push(item)
    const child = source.dimensions.find((candidate) => candidate.code === item.child)
    if (child) ordered.push(child)
  }
  return ordered
}

export const PIE_MAX_CATEGORIES = 6

/**
 * Qué gráfica se dibuja de verdad. AUTO: línea para el tiempo; barras horizontales
 * cuando hay muchas categorías o nombres largos (33 departamentos no caben girados).
 * La torta sólo con seis porciones o menos.
 */
export function resolveChartType(result: ExploreResult, chosen: ChartType): Exclude<ChartType, 'AUTO'> {
  const count = result.rows.length + (result.others ? 1 : 0)
  if (chosen === 'PIE' && count > PIE_MAX_CATEGORIES) return 'BAR_HORIZONTAL'
  if (chosen !== 'AUTO') return chosen
  if (result.dimension.kind !== 'CATEGORY') return 'LINE'
  const longest = Math.max(0, ...result.rows.map((row) => row.label.length))
  return count > 12 || longest > 12 ? 'BAR_HORIZONTAL' : 'BAR_VERTICAL'
}
