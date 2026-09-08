import { useQuery } from '@tanstack/react-query'
import { customFetch } from '@/api/client'
import type { FormField, ImportProfileSummary, IncidentProfile, SheetForm } from '@/lib/observatory/types'

export const IMPORT_PROFILES_KEY = ['observatory', 'profiles'] as const

export function useImportProfiles() {
  return useQuery({
    queryKey: IMPORT_PROFILES_KEY,
    queryFn: () => customFetch<ImportProfileSummary[]>('/api/v1/observatory/profiles'),
    staleTime: 5 * 60_000,
    networkMode: 'always',
    retry: false,
  })
}

/**
 * SPEC-0806 CA-1/CA-2: la pantalla de captura se dibuja contra la versión MÁS
 * ALTA del perfil, que es la que describe el archivo tal como llega hoy. Las
 * versiones anteriores se conservan para la procedencia de cortes ya cargados,
 * pero no se capturan hechos nuevos con ellas.
 */
export function latestProfile(profiles: ImportProfileSummary[] | undefined): ImportProfileSummary | undefined {
  return profiles?.reduce<ImportProfileSummary | undefined>(
    (best, profile) => (best && best.version >= profile.version ? best : profile),
    undefined,
  )
}

/** El formulario de la hoja que corresponde al delito elegido. */
export function formForProfile(
  profile: ImportProfileSummary | undefined,
  incidentProfile: IncidentProfile,
): SheetForm | undefined {
  return profile?.forms.find((form) => form.profile === incidentProfile)
}

/**
 * SPEC-0806 CA-3: las columnas de la TABLA salen del mismo sitio que las del
 * formulario, así que el analista ve el registro con la misma forma que su
 * Excel. La tabla mezcla las dos hojas del libro, así que se unen sus campos:
 * se conserva el orden de la primera hoja y se anexan al final los que sólo
 * existen en la otra (MODALIDAD, que es de extorsión).
 */
export function tableFieldsOf(profile: ImportProfileSummary | undefined): FormField[] {
  const byCode = new Map<string, FormField>()
  for (const form of profile?.forms ?? []) {
    for (const field of form.fields) {
      if (!byCode.has(field.code)) byCode.set(field.code, field)
    }
  }
  return [...byCode.values()]
}

/** Las columnas declaradas (SPEC-0806): van en `attributes`, no en columnas tipadas. */
export function dynamicFieldsOf(profile: ImportProfileSummary | undefined) {
  const byCode = new Map<string, string>()
  for (const form of profile?.forms ?? []) {
    for (const field of form.fields) {
      if (field.dynamic) byCode.set(field.code, field.label)
    }
  }
  return [...byCode].map(([code, label]) => ({ code, label }))
}
