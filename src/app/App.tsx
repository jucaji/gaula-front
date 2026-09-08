import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { useEffect } from 'react'
import { router } from './router'
import { useSessionQuery } from '@/lib/auth/useSession'
import { consumeIntendedRoute, redirectToLogin } from '@/lib/auth/session'
import { can } from '@/lib/permissions'
import { useCaseFileRealtime } from '@/lib/realtime/useCaseFileRealtime'
import { Spinner } from '@/design-system/primitives/Spinner'
import { AuthErrorScreen } from '@/design-system/patterns/AuthErrorScreen'

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
/**
 * `?authError=1` lo pone el backend cuando falla la autenticación (docs/04 §2.6).
 *
 * <p>Se lee A NIVEL DE MÓDULO, no dentro del componente, y por una razón concreta:
 * bajo React 19 en StrictMode los componentes se montan DOS VECES en desarrollo.
 * La primera versión leía el parámetro en el estado y lo borraba de la barra de
 * direcciones en un efecto; al segundo montaje el parámetro ya no estaba, la
 * señal se perdía y el usuario veía un spinner infinito en vez del mensaje de
 * error. Es el mismo tropiezo con StrictMode que ya costó el hallazgo de
 * `retry: false` en las consultas.
 *
 * <p>El módulo se evalúa una sola vez, así que la señal sobrevive a los remontajes
 * y la barra de direcciones queda limpia desde el principio.
 */
const AUTH_FAILED = new URLSearchParams(window.location.search).has('authError')

if (AUTH_FAILED) {
  const url = new URL(window.location.href)
  url.searchParams.delete('authError')
  window.history.replaceState(null, '', url.pathname + url.search)
}

function SessionGate() {
  const { data: session, isPending, isError } = useSessionQuery()

  useEffect(() => {
    if (AUTH_FAILED) return
    if (isError) redirectToLogin()
  }, [isError])

  // Vuelta del login: el backend siempre devuelve a la raíz de la consola
  // (docs/04 §2.6), porque la petición que él vio era `/api/v1/me` y
  // reproducirla dejaba al usuario mirando un JSON. La ruta que el usuario
  // quería la guardó ESTA aplicación antes de salir, así que es aquí donde se
  // restaura -- una sola vez y sólo si hay sesión.
  useEffect(() => {
    if (!session) return
    const intended = consumeIntendedRoute()
    if (intended && intended !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', intended)
    }
  }, [session])

  // docs/07 §4: "un solo WebSocket por sesión" -- se monta aquí, no por
  // página (evita una conexión por ruta), y sólo conecta una vez la sesión
  // está confirmada (el handshake exige la misma autenticación que /api/**).
  useCaseFileRealtime(queryClient, Boolean(session))

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <Spinner size={28} label="Cargando sesión" />
      </div>
    )
  }

  // El backend manda aquí cuando el login falla (docs/04 §2.6): se explica
  // DENTRO de la consola, en vez de dejar al usuario en la página que Spring
  // genera sola, en inglés y fuera del sistema.
  if (AUTH_FAILED) {
    return <AuthErrorScreen onRetry={redirectToLogin} />
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
