import { useQuery } from '@tanstack/react-query'
import { fetchSession } from './session'

/**
 * Sin `retry`: un fallo aquí es "no hay sesión", no una falla de red
 * transitoria (mismo hallazgo que en useCaseFileSearch, casos/index.tsx --
 * `retry` por defecto puede dejar la query en `fetchStatus: 'paused'` para
 * siempre bajo React 19 StrictMode). `staleTime: Infinity` porque la
 * sesión no cambia durante la vida de la SPA -- un logout real recarga la
 * página completa.
 */
export function useSessionQuery() {
  return useQuery({
    queryKey: ['session', 'me'],
    queryFn: fetchSession,
    retry: false,
    staleTime: Infinity,
    networkMode: 'always',
  })
}
