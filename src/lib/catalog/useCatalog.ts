import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { customFetch } from '@/api/client'
import type { CrimeTypeResponse, MunicipalityResponse } from '@/api/generated/models'
import { createBatchLoader } from './batchLoader'

const DIVIPOLA = /^\d{5}$/

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

/** Las tipologías cambian con una resolución, no con cada pantalla: cinco minutos de vigencia sobran. */
export function useCrimeTypes() {
  return useQuery({
    queryKey: ['catalog', 'crime-types'],
    queryFn: () => customFetch<CrimeTypeResponse[]>('/api/v1/catalog/crime-types'),
    staleTime: 5 * 60_000,
    networkMode: 'always',
    retry: false,
  })
}

/** S4.FE.04 / SPEC-0108: por nombre o por prefijo de código; menos de 2 caracteres no consulta. */
export function useMunicipalitySearch(q: string) {
  const debouncedQ = useDebouncedValue(q, 250)
  return useQuery({
    queryKey: ['catalog', 'municipalities', debouncedQ],
    queryFn: () => customFetch<MunicipalityResponse[]>(`/api/v1/catalog/municipalities?q=${encodeURIComponent(debouncedQ)}`),
    enabled: debouncedQ.trim().length >= 2,
    staleTime: 10_000,
    networkMode: 'always',
    retry: false,
  })
}

const municipalityLoader = createBatchLoader<string, MunicipalityResponse>(async (codes) => {
  const rows = await customFetch<MunicipalityResponse[]>(
    `/api/v1/catalog/municipalities/by-code?codes=${codes.map(encodeURIComponent).join(',')}`,
  )
  const found = new Map<string, MunicipalityResponse>()
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row.code) found.set(row.code, row)
  }
  return found
}, { maxBatch: 100 })

/**
 * SPEC-0108 CA-5: el nombre de un municipio a partir de su código. Cada celda lo
 * pide por su cuenta y el cargador los junta en una sola petición. Un municipio
 * no cambia de nombre en una sesión: una hora de vigencia.
 */
export function useMunicipality(code: string | null | undefined) {
  return useQuery({
    queryKey: ['catalog', 'municipality', code],
    queryFn: () => municipalityLoader.load(code as string),
    enabled: typeof code === 'string' && DIVIPOLA.test(code),
    staleTime: 60 * 60_000,
    networkMode: 'always',
    retry: false,
  })
}
