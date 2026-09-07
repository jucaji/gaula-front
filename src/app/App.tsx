import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { useEffect } from 'react'
import { router } from './router'
import { useSessionQuery } from '@/lib/auth/useSession'
import { redirectToLogin } from '@/lib/auth/session'
import { can } from '@/lib/permissions'
import { Spinner } from '@/design-system/primitives/Spinner'

// docs/07 §3: política de caché por tipo de dato -- el default aquí es el
// de "estado del servidor operativo" (caseDetail); cada query concreta
// sobreescribe staleTime/gcTime según su propia naturaleza (catálogos,
// analítica…) en su propio hook.
//
// HALLAZGO: `retry: 1` (default) + React 19 StrictMode (doble montaje en
// dev) puede dejar una query fallida en `fetchStatus: 'paused'` para
// siempre -- sin loading, error ni data (ver useCaseFileSearch en
// src/routes/casos/index.tsx). `networkMode: 'always'` NO lo evita.
// Cualquier hook cuyo fallo sea determinista (auth ausente, 4xx) debe
// pasar `retry: false` explícito en vez de heredar este default.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionGate />
    </QueryClientProvider>
  )
}

/**
 * El router necesita la sesión en su `context` desde el primer render --
 * pero resolverla es una llamada de red real (`GET /api/v1/me`), así que
 * la app entera espera aquí antes de montar las rutas. Sin sesión válida,
 * `useSessionQuery` falla (ver session.ts) y esto saca al usuario de la
 * SPA por completo hacia el login de Keycloak -- nunca se llega a
 * renderizar una ruta sin sesión.
 */
function SessionGate() {
  const { data: session, isPending, isError } = useSessionQuery()

  useEffect(() => {
    if (isError) redirectToLogin()
  }, [isError])

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <Spinner size={28} label="Cargando sesión" />
      </div>
    )
  }

  if (isError || !session) {
    return null // redirectToLogin ya está navegando fuera de la SPA
  }

  return (
    <RouterProvider
      router={router}
      context={{
        queryClient,
        session,
        can: (action, resource) => can(action, resource, session.roles),
      }}
    />
  )
}
