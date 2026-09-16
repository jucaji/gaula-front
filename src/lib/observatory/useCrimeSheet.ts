import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { customFetch } from '@/api/client'
import type { IncidentAnalysis } from './types'

/** SPEC-0809: la ficha de un delito sobre las cifras oficiales de Mindefensa. */
export type OfficialIndicator =
  | 'EXTORTION'
  | 'KIDNAPPING_TOTAL'
  | 'KIDNAPPING_EXTORTIVE'
  | 'KIDNAPPING_SIMPLE'
  | 'HUMAN_TRAFFICKING'
  | 'MIGRANT_SMUGGLING'

export type TerritoryPeriod = 'YEAR_TO_DATE' | 'LAST_FULL_YEAR'

/** La dirección habla español; el contrato, los códigos. */
export const INDICATORS: { slug: string; code: OfficialIndicator; label: string; hidden?: boolean }[] = [
  { slug: 'extorsion', code: 'EXTORTION', label: 'Extorsión' },
  { slug: 'secuestro', code: 'KIDNAPPING_TOTAL', label: 'Secuestro total' },
  { slug: 'secuestro-extorsivo', code: 'KIDNAPPING_EXTORTIVE', label: 'Secuestro extorsivo' },
  { slug: 'secuestro-simple', code: 'KIDNAPPING_SIMPLE', label: 'Secuestro simple' },
  { slug: 'trata', code: 'HUMAN_TRAFFICKING', label: 'Trata de personas' },
  { slug: 'trafico-de-migrantes', code: 'MIGRANT_SMUGGLING', label: 'Tráfico de migrantes', hidden: true },
]

export function indicatorBySlug(slug: string) {
  return INDICATORS.find((indicator) => indicator.slug === slug)
}

export interface YearValue {
  year: number
  /** `null`: el año queda antes de la serie. Cero es cero. */
  victims: number | null
}

export interface MonthValue {
  month: number
  previous: number | null
  /** `null`: el mes todavía no ha pasado. No es cero. */
  current: number | null
  partial: boolean
}

export interface Variation {
  previousFrom: string
  previousTo: string
  currentFrom: string
  currentTo: string
  previous: number
  current: number
  absolute: number
  percent: number | null
}

export interface SheetTerritory {
  code: string
  name: string
  victims: number
  latitude: number | null
  longitude: number | null
}

export interface CrimeSheet {
  indicator: OfficialIndicator
  indicatorLabel: string
  available: boolean
  department: { code: string; name: string } | null
  loadId: string | null
  source: string | null
  publishedAt: string | null
  firstDate: string | null
  cutoffDate: string | null
  partialCutoffMonth: boolean
  history: YearValue[]
  yearToDate: YearValue[]
  previousYear: number
  currentYear: number
  monthly: MonthValue[]
  sameWindow: Variation | null
  fullMonths: Variation | null
  notes: { effectiveOn: string; label: string }[]
  territoryPeriod: TerritoryPeriod | null
  territoryFrom: string | null
  territoryTo: string | null
  territoryLevel: 'DEPARTMENT' | 'MUNICIPALITY' | null
  territories: SheetTerritory[]
}

const BASE = '/api/v1/observatory/official-statistics'

function query(indicator: OfficialIndicator, departmentCode: string | undefined, period: TerritoryPeriod) {
  const params = new URLSearchParams({ indicator, period })
  if (departmentCode) params.set('departmentCode', departmentCode)
  return params.toString()
}

export function useCrimeSheet(indicator: OfficialIndicator, departmentCode: string | undefined, period: TerritoryPeriod) {
  return useQuery({
    queryKey: ['observatory', 'official-statistics', 'sheet', indicator, departmentCode ?? null, period],
    queryFn: () => customFetch<CrimeSheet>(`${BASE}/sheet?${query(indicator, departmentCode, period)}`),
    staleTime: 60_000,
    networkMode: 'always',
    retry: false,
    // Cambiar de periodo o de delito no desmonta la pantalla (defecto vivido en SPEC-0807).
    placeholderData: keepPreviousData,
  })
}

/**
 * SPEC-0811: el análisis de la serie, en su propia consulta. Si el servicio de
 * análisis está caído, la ficha ya se pintó completa; esto sólo agrega o explica.
 */
export function useCrimeSheetAnalysis(indicator: OfficialIndicator, departmentCode: string | undefined, enabled: boolean) {
  const params = new URLSearchParams({ indicator })
  if (departmentCode) params.set('departmentCode', departmentCode)
  return useQuery({
    queryKey: ['observatory', 'official-statistics', 'analysis', indicator, departmentCode ?? null],
    queryFn: () => customFetch<IncidentAnalysis>(`${BASE}/sheet/analysis?${params.toString()}`),
    enabled,
    staleTime: 5 * 60_000,
    networkMode: 'always',
    retry: false,
    placeholderData: keepPreviousData,
  })
}

export async function downloadSheetPdf(indicator: OfficialIndicator, departmentCode: string | undefined,
  period: TerritoryPeriod, fileName: string) {
  const blob = await customFetch<Blob>(`${BASE}/sheet.pdf?${query(indicator, departmentCode, period)}`)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const NUMBER = new Intl.NumberFormat('es-CO')
const PERCENT = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' })

export function formatVictims(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : NUMBER.format(value)
}

export function formatSigned(value: number): string {
  return `${value > 0 ? '+' : ''}${NUMBER.format(value)}`
}

/** Sin variación desde cero: un «+∞ %» no le dice nada a nadie. */
export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${PERCENT.format(value)} %`
}

/** «30 jul», con la misma abreviatura de mes que los ejes. `Intl` en es-CO escribe «30 de jul». */
export function formatShortDay(isoDate: string): string {
  return `${Number(isoDate.slice(8, 10))} ${MONTHS[Number(isoDate.slice(5, 7)) - 1]}`
}
