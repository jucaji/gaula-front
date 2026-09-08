import { useQuery } from '@tanstack/react-query'
import { customFetch } from '@/api/client'

export interface DepartmentGeometry {
  code: string
  name: string
  /** GeoJSON crudo tal como lo devolvió PostGIS. */
  geometry: { type: string; coordinates: unknown }
}

/**
 * SPEC-0807: los límites de los departamentos.
 *
 * <p>`staleTime: Infinity` a propósito: son fronteras, no cifras. Cambian una vez
 * cada varios años y el tablero se recarga con cada filtro; volver a pedirlas
 * sería mover el mapa de Colombia entero cada vez que alguien mueve una fecha.
 *
 * <p>`enabled` porque sólo hace falta cuando el usuario pide la vista por
 * departamentos: quien nunca la abre no baja la geometría.
 */
export function useDepartmentGeometry(enabled: boolean) {
  return useQuery({
    queryKey: ['catalog', 'departments', 'geometry'],
    queryFn: () => customFetch<DepartmentGeometry[]>('/api/v1/catalog/departments/geometry'),
    staleTime: Infinity,
    gcTime: Infinity,
    networkMode: 'always',
    retry: false,
    enabled,
  })
}
