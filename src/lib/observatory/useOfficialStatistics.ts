import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { customFetch } from '@/api/client'

/** SPEC-0808: cifras oficiales de Mindefensa. La medida es víctimas; una fila no es un caso. */
export type OfficialSeries = 'EXTORTION' | 'KIDNAPPING' | 'TRAFFICKING'

export const OFFICIAL_SERIES: { code: OfficialSeries; label: string; file: string }[] = [
  { code: 'EXTORTION', label: 'Extorsión', file: 'EXTORSIÓN.xlsx' },
  { code: 'KIDNAPPING', label: 'Secuestro', file: 'SECUESTRO.xlsx' },
  { code: 'TRAFFICKING', label: 'Trata de personas y tráfico de migrantes', file: 'TRATA DE PERSONAS Y TRÁFICO DE MIGRANTES.xlsx' },
]

export interface OfficialBucket {
  year: number
  conduct: string
  rows: number
  victims: number
}

export interface OfficialLoad {
  id: string
  series: OfficialSeries
  seriesLabel: string
  source: string
  fileName: string
  fileHash: string
  status: 'PREVIEWED' | 'ACTIVE' | 'SUPERSEDED'
  firstDate: string | null
  cutoffDate: string | null
  rows: number
  victims: number
  victimsByYear: { year: number; victims: number }[]
  victimsByConduct: { conduct: string; article: string; label: string; hiddenByDefault: boolean; victims: number }[]
  buckets: OfficialBucket[]
  errorCount: number
  errors: { rowNumber: number; problem: string; value: string }[]
  unknownMunicipalityCount: number
  unknownMunicipalities: { code: string; name: string; departmentName: string; rows: number; victims: number }[]
  warnings: string[]
  comparedWithLoadId: string | null
  comparison: { year: number; previous: number | null; current: number | null; difference: number | null }[]
  createdAt: string
  expiresAt: string
  appliedAt: string | null
  supersededAt: string | null
}

export interface OfficialSeriesSummary {
  series: OfficialSeries
  seriesLabel: string
  includeHidden: boolean
  load: OfficialLoad | null
  victimsByYear: { year: number; victims: number }[]
  buckets: OfficialBucket[]
}

const BASE = '/api/v1/observatory/official-statistics'
const KEY = ['observatory', 'official-statistics'] as const

export function useOfficialSummary(series: OfficialSeries) {
  return useQuery({
    queryKey: [...KEY, 'summary', series],
    queryFn: () => customFetch<OfficialSeriesSummary>(`${BASE}/summary?series=${series}`),
    staleTime: 60_000,
    networkMode: 'always',
    retry: false,
  })
}

export function useOfficialLoads() {
  return useQuery({
    queryKey: [...KEY, 'loads'],
    queryFn: () => customFetch<OfficialLoad[]>(`${BASE}/loads?limit=20`),
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

/**
 * Mirar y aplicar son dos actos. Aplicar reenvía el MISMO archivo: el backend
 * compara su huella con la de la vista previa, así que no se publica un archivo
 * distinto del que se revisó.
 */
export function useOfficialImport() {
  const queryClient = useQueryClient()

  const preview = useMutation({
    mutationFn: ({ file, series }: { file: File; series: OfficialSeries }) => {
      const form = new FormData()
      form.append('file', file)
      return customFetch<OfficialLoad>(`${BASE}/preview?series=${series}`, { method: 'POST', body: form })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...KEY, 'loads'] }),
  })

  const apply = useMutation({
    mutationFn: ({ loadId, file }: { loadId: string; file: File }) => {
      const form = new FormData()
      form.append('file', file)
      return customFetch<OfficialLoad>(`${BASE}/${loadId}/apply`, { method: 'POST', body: form })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })

  return { preview, apply }
}

export const ROW_PROBLEMS: Record<string, string> = {
  MISSING_VALUE: 'Falta un valor obligatorio',
  INVALID_DATE: 'Fecha inválida',
  INVALID_DEPARTMENT_CODE: 'Código de departamento inválido',
  INVALID_MUNICIPALITY_CODE: 'Código de municipio inválido',
  MUNICIPALITY_OUTSIDE_DEPARTMENT: 'El municipio no pertenece al departamento',
  INVALID_QUANTITY: 'Cantidad inválida (debe ser un entero mayor que cero)',
  MISSING_CONDUCT: 'Falta la conducta',
  UNKNOWN_CONDUCT: 'Conducta no reconocida (no cita un artículo conocido)',
  CONDUCT_OF_OTHER_SERIES: 'La conducta pertenece a otro archivo',
}

export const WARNINGS: Record<string, string> = {
  PARTIAL_LAST_MONTH: 'El archivo termina a mitad de mes: ese mes está incompleto y no debe compararse como mes completo.',
  OLDER_THAN_ACTIVE: 'El corte de este archivo es ANTERIOR al de las cifras vigentes.',
  SAME_AS_ACTIVE: 'Es exactamente el mismo archivo que ya está vigente.',
}

const NUMBER = new Intl.NumberFormat('es-CO')

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : NUMBER.format(value)
}

const DAY = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** Una fecha de corte (`2026-07-30`) como la lee una persona: «30 de jul de 2026». */
export function formatDay(isoDate: string | null | undefined): string {
  return isoDate ? DAY.format(new Date(`${isoDate}T00:00:00Z`)) : '—'
}
