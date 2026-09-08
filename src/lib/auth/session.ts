import { customFetch } from '@/api/client'
import type { RoleCode } from './roles'

export interface Session {
  userId: string
  displayName: string
  roles: RoleCode[]
  territorialUnitId: string
  operationalUnitId?: string
}

/**
 * `GET /api/v1/me` (backend, iam módulo): la sesión OIDC ya resuelta a
 * `iam.app_user`. Sin sesión válida, Spring Security redirige a Keycloak
 * (origen distinto, puerto 8081) -- ese redirect cross-origin lo bloquea
 * CORS y `fetch` lo ve como `TypeError: Failed to fetch`, nunca como un
 * 401 limpio. `useSessionQuery` en useSession.ts trata cualquier fallo
 * aquí como "no autenticado" y manda a `redirectToLogin`.
 */
export async function fetchSession(): Promise<Session> {
  return customFetch<Session>('/api/v1/me')
}

const INTENDED_ROUTE_KEY = 'gaula.intended-route'

/**
 * Navegación de página completa -- el flujo OAuth2 necesita salir de la SPA,
 * nunca un fetch.
 *
 * <p>Antes de salir se guarda LA RUTA donde estaba el usuario. El backend no
 * puede saberla: lo que él ve es la llamada a `/api/v1/me`, y por eso su
 * `RequestCache` quedó desactivado (docs/04 §2.6) -- reproducir una petición de
 * API dejaba al usuario mirando un JSON. Quien conoce la ruta es la consola, así
 * que es la consola quien la restaura.
 */
export function redirectToLogin(): void {
  const intended = window.location.pathname + window.location.search
  // La raíz no se guarda: restaurarla no aporta nada y ensucia el almacenamiento.
  if (intended !== '/') {
    sessionStorage.setItem(INTENDED_ROUTE_KEY, intended)
  }
  window.location.href = '/oauth2/authorization/keycloak'
}

/**
 * La ruta que el usuario intentaba abrir antes de que lo mandaran al login, si
 * la hay. Se consume UNA sola vez.
 *
 * <p>Se valida que sea una ruta interna (empieza por `/` y no por `//`) antes de
 * devolverla: aunque el valor lo escribió esta misma aplicación, navegar a una
 * cadena sacada del almacenamiento sin comprobarla es la forma clásica de
 * convertir un detalle de comodidad en una redirección abierta.
 */
export function consumeIntendedRoute(): string | null {
  const intended = sessionStorage.getItem(INTENDED_ROUTE_KEY)
  sessionStorage.removeItem(INTENDED_ROUTE_KEY)
  if (!intended || !intended.startsWith('/') || intended.startsWith('//')) {
    return null
  }
  return intended
}
