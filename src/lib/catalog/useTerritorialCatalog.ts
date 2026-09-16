import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { customFetch } from '@/api/client'

const BASE = '/api/v1/admin/catalog'

export interface MunicipalityAdmin {
  code: string
  name: string
  departmentCode: string
  departmentName: string
  population?: number | null
  latitude?: number | null
  longitude?: number | null
  territorialUnitId?: string | null
  territorialUnitName?: string | null
  routingValidFrom?: string | null
  retiredAt?: string | null
  retiredNote?: string | null
  version: number
}

export interface MunicipalityAdminPage {
  content: MunicipalityAdmin[]
  totalElements: number
  page: number
  size: number
}

export interface DepartmentAdmin {
  code: string
  name: string
  municipalityCount: number
  retiredAt?: string | null
  version: number
}

export interface TerritorialUnitOption {
  id: string
  code: string
  name: string
}

/**
 * `| undefined` explícito: con `exactOptionalPropertyTypes`, «la propiedad puede
 * faltar» y «la propiedad vale undefined» son cosas distintas, y los filtros de
 * la URL llegan como lo segundo.
 */
export interface MunicipalityFilters {
  q?: string | undefined
  departmentCode?: string | undefined
  onlyWithoutRouting?: boolean | undefined
  includeRetired?: boolean | undefined
  page?: number | undefined
  size?: number | undefined
}

export interface MunicipalityFormValues {
  code?: string
  departmentCode?: string
  name: string
  population?: number | null
  latitude?: number | null
  longitude?: number | null
}

const MUNICIPALITIES_KEY = ['admin', 'catalog', 'municipalities'] as const

export function useTerritorialMunicipalities(filters: MunicipalityFilters) {
  return useQuery({
    queryKey: [...MUNICIPALITIES_KEY, filters],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(filters.page ?? 0),
        size: String(filters.size ?? 50),
        onlyWithoutRouting: String(filters.onlyWithoutRouting ?? false),
        includeRetired: String(filters.includeRetired ?? false),
      })
      if (filters.q) params.set('q', filters.q)
      if (filters.departmentCode) params.set('departmentCode', filters.departmentCode)
      return customFetch<MunicipalityAdminPage>(`${BASE}/municipalities?${params.toString()}`)
    },
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

export function useTerritorialDepartments(includeRetired = false) {
  return useQuery({
    queryKey: ['admin', 'catalog', 'departments', includeRetired],
    queryFn: () => customFetch<DepartmentAdmin[]>(`${BASE}/departments?includeRetired=${includeRetired}`),
    staleTime: 60_000,
    networkMode: 'always',
    retry: false,
  })
}

/** Las unidades territoriales viven en `iam`; aquí sólo se listan para asignar el GAULA de un municipio. */
export function useTerritorialUnitOptions() {
  return useQuery({
    queryKey: ['territorial-units'],
    queryFn: () => customFetch<TerritorialUnitOption[]>('/api/v1/territorial-units'),
    staleTime: 60_000,
    networkMode: 'always',
    retry: false,
  })
}

/**
 * SPEC-0109. La corrección viaja con `If-Match`: dos administradores sobre el
 * mismo municipio se detectan, no se pisan.
 */
export function useTerritorialCatalogMutations() {
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: MUNICIPALITIES_KEY })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'catalog', 'departments'] })
    // El selector de SPEC-0108 lee el mismo catálogo: un municipio retirado
    // tiene que dejar de ofrecerse sin recargar la consola.
    await queryClient.invalidateQueries({ queryKey: ['catalog'] })
  }

  const create = useMutation({
    mutationFn: (values: MunicipalityFormValues) =>
      customFetch<MunicipalityAdmin>(`${BASE}/municipalities`, { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: invalidate,
  })

  const correct = useMutation({
    mutationFn: ({ code, version, values }: { code: string; version: number; values: MunicipalityFormValues }) =>
      customFetch<MunicipalityAdmin>(`${BASE}/municipalities/${code}`, {
        method: 'PUT',
        headers: { 'If-Match': String(version) },
        body: JSON.stringify(values),
      }),
    onSuccess: invalidate,
  })

  const retire = useMutation({
    mutationFn: ({ code, note }: { code: string; note: string }) =>
      customFetch<MunicipalityAdmin>(`${BASE}/municipalities/${code}/retire`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
    onSuccess: invalidate,
  })

  const reactivate = useMutation({
    mutationFn: (code: string) =>
      customFetch<MunicipalityAdmin>(`${BASE}/municipalities/${code}/reactivate`, { method: 'POST' }),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (code: string) =>
      customFetch<{ outcome: 'DELETED' | 'RETIRED' }>(`${BASE}/municipalities/${code}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  const assignRouting = useMutation({
    mutationFn: ({ code, territorialUnitId, effectiveDate, sourceDocument }: {
      code: string
      territorialUnitId: string
      effectiveDate: string
      sourceDocument?: string | undefined
    }) =>
      customFetch<MunicipalityAdmin>(`${BASE}/municipalities/${code}/routing`, {
        method: 'POST',
        body: JSON.stringify({ territorialUnitId, effectiveDate, sourceDocument }),
      }),
    onSuccess: invalidate,
  })

  return { create, correct, retire, reactivate, remove, assignRouting }
}

// --- SPEC-0110: carga del archivo del DANE ---------------------------------

export interface DivipolaPlan {
  newDepartments: { code: string; name: string }[]
  newMunicipalities: { code: string; departmentCode: string; name: string; latitude?: number | null; longitude?: number | null }[]
  changed: {
    code: string
    currentName: string
    newName: string
    reactivates: boolean
    fields: string[]
  }[]
  missing: { code: string; name: string; alreadyRetired: boolean }[]
  errors: { rowNumber: number; raw: string; message: string }[]
}

export interface DivipolaImportView {
  id: string
  fileName: string
  fileHash: string
  cutoffDate?: string | null
  source?: string | null
  status: 'PREVIEWED' | 'APPLIED'
  newCount: number
  changedCount: number
  missingCount: number
  errorCount: number
  appliedNew?: number | null
  appliedChanged?: number | null
  appliedRetired?: number | null
  createdAt: string
  expiresAt: string
  appliedAt?: string | null
  plan: DivipolaPlan
}

const DIVIPOLA = '/api/v1/admin/catalog/divipola'

export function useDivipolaHistory() {
  return useQuery({
    queryKey: ['admin', 'catalog', 'divipola', 'imports'],
    queryFn: () => customFetch<DivipolaImportView[]>(`${DIVIPOLA}/imports?limit=10`),
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

/**
 * SPEC-0110: mirar y aplicar son dos actos. La vista previa no escribe nada; al
 * confirmar se envía el hash del archivo para que no se aplique el plan de otro.
 */
export function useDivipolaImport() {
  const queryClient = useQueryClient()

  const preview = useMutation({
    mutationFn: ({ file, cutoffDate, source }: { file: File; cutoffDate?: string | undefined; source?: string | undefined }) => {
      const form = new FormData()
      form.append('file', file)
      const params = new URLSearchParams()
      if (cutoffDate) params.set('cutoffDate', cutoffDate)
      if (source) params.set('source', source)
      const query = params.toString()
      return customFetch<DivipolaImportView>(`${DIVIPOLA}/preview${query ? `?${query}` : ''}`, {
        method: 'POST',
        body: form,
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'catalog', 'divipola', 'imports'] }),
  })

  const apply = useMutation({
    mutationFn: ({ importId, fileHash, retireCodes }: { importId: string; fileHash: string; retireCodes: string[] }) =>
      customFetch<DivipolaImportView>(`${DIVIPOLA}/${importId}/apply`, {
        method: 'POST',
        body: JSON.stringify({ fileHash, retireCodes, applyNew: true, applyChanged: true }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MUNICIPALITIES_KEY })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'catalog', 'departments'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'catalog', 'divipola', 'imports'] })
      await queryClient.invalidateQueries({ queryKey: ['catalog'] })
    },
  })

  return { preview, apply }
}
