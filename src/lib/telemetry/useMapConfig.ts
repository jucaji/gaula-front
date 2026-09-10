import { useQuery } from '@tanstack/react-query'
import { customFetch } from '@/api/client'
import type { MapProviderConfig } from './types'

/**
 * La configuración cartográfica, servida por el backend en tiempo de ejecución.
 *
 * La clave del SDK **no se hornea en el bundle**. No porque así quede secreta
 * -- el SDK corre en el navegador, la clave es pública por construcción y
 * afirmar lo contrario sería falso -- sino porque así se puede rotar sin
 * reconstruir ni volver a desplegar el frontend. Lo que de verdad la protege es
 * la restricción por referrer y por API en la consola del proveedor.
 *
 * Con `configured: false` la consola tiene que decirlo. Un despliegue sin
 * internet (docs/08 §5) es un caso previsto, no un fallo, y un rectángulo en
 * blanco sin explicación sería peor que un mensaje.
 */
export function useMapConfig() {
  return useQuery<MapProviderConfig>({
    queryKey: ['config', 'map'],
    queryFn: () => customFetch<MapProviderConfig>('/api/v1/telemetry/map-config'),
    staleTime: Infinity,
    gcTime: Infinity,
    networkMode: 'always',
    retry: false,
  })
}
