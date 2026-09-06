import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { useSession } from '@/lib/auth/useSession'
import { can } from '@/lib/permissions'

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
  const session = useSession()

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider
        router={router}
        context={{
          queryClient,
          session,
          can: (action, resource) => can(action, resource, session.roles),
        }}
      />
    </QueryClientProvider>
  )
}
