import { useCrimeTypes, useMunicipality } from '@/lib/catalog/useCatalog'

/**
 * SPEC-0108 CA-5: donde el sistema guarda «25290», la persona lee «Fusagasugá,
 * Cundinamarca». Mientras el nombre no llega —o si no llega nunca: sin red en
 * campo, código desconocido— se muestra el código, que es mejor que nada.
 */
export function MunicipalityName({ code, withCode = false }: { code: string | null | undefined; withCode?: boolean }) {
  const municipality = useMunicipality(code)
  if (!code) return <>—</>
  if (!municipality.data) return <>{code}</>
  return (
    <>
      {municipality.data.name}, {municipality.data.departmentName}
      {withCode && <span className="text-text-muted"> ({code})</span>}
    </>
  )
}

export function CrimeTypeName({ code }: { code: string | null | undefined }) {
  const crimeTypes = useCrimeTypes()
  if (!code) return <>—</>
  const found = Array.isArray(crimeTypes.data) ? crimeTypes.data.find((type) => type.code === code) : undefined
  return <>{found?.name ?? code}</>
}
